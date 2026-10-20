import os
import tempfile
import asyncio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import yt_dlp
from faster_whisper import WhisperModel

app = FastAPI(
    title="Whisper Transcription API",
    description="Microservice to download and transcribe YouTube audio using faster-whisper.",
    version="1.0.0"
)

# Global model variable to load the model into GPU memory once
model = None

@app.on_event("startup")
async def startup_event():
    global model
    # Load the Whisper model on startup
    # Options: "tiny", "base", "small", "medium", "large-v3"
    print("Loading Whisper model into memory...")
    try:
        # device="cuda" if you have a GPU, else "cpu"
        model = WhisperModel("base", device="cuda", compute_type="float16")
        print("Whisper model loaded successfully!")
    except Exception as e:
        print(f"Failed to load Whisper on CUDA, falling back to CPU. Error: {e}")
        model = WhisperModel("base", device="cpu", compute_type="int8")


class TranscribeRequest(BaseModel):
    url: str

class TranscribeResponse(BaseModel):
    success: bool
    text: str
    segments: list


def _download_audio(url: str) -> str:
    """Download audio from YouTube using yt-dlp."""
    tmp_dir = tempfile.mkdtemp()
    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
        'outtmpl': os.path.join(tmp_dir, '%(id)s.%(ext)s'),
        'quiet': True,
        'no_warnings': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return os.path.join(tmp_dir, f"{info['id']}.{info.get('ext', 'm4a')}")

@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(req: TranscribeRequest):
    """
    1. Downloads audio from the provided YouTube URL.
    2. Transcribes it using Faster Whisper.
    3. Returns the transcription text and precise timestamp segments.
    """
    audio_path = None
    try:
        print(f"Downloading audio for: {req.url}")
        # Run the blocking download in a separate thread so we don't freeze the API
        audio_path = await asyncio.to_thread(_download_audio, req.url)

        print(f"Transcribing audio: {audio_path}")
        # Transcribe the audio
        # Run blocking transcription in a thread
        def _do_transcribe():
            segments, info = model.transcribe(audio_path, beam_size=5)
            # Exhaust the generator to get all segments
            segment_list = []
            full_text = ""
            for seg in segments:
                segment_list.append({
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text
                })
                full_text += seg.text + " "
            return full_text.strip(), segment_list

        text, segments = await asyncio.to_thread(_do_transcribe)

        return TranscribeResponse(
            success=True,
            text=text,
            segments=segments
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    
    finally:
        # Always clean up the downloaded audio file to save disk space
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
            # Remove the temp directory as well
            tmp_dir = os.path.dirname(audio_path)
            if os.path.exists(tmp_dir):
                os.rmdir(tmp_dir)

if __name__ == "__main__":
    import uvicorn
    # Run the server on port 8001
    uvicorn.run(app, host="0.0.0.0", port=8001)

FROM python:3.11-slim
WORKDIR /app

# Install build dependencies for ChromaDB and other C-bindings
RUN apt-get update && apt-get install -y build-essential curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ensure the Chroma DB directory is accessible and persisted
RUN mkdir -p qdrant_data

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

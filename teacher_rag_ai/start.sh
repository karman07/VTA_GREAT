#!/usr/bin/env bash
# start.sh — Start the TeachAI RAG service
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create venv if missing
if [ ! -d ".venv" ]; then
  echo "Creating virtual environment..."
  python3.12 -m venv .venv
fi

# Activate venv
source .venv/bin/activate

# Install / update deps
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Copy .env from example if missing
if [ ! -f ".env" ]; then
  echo "⚠️  No .env found — copying from .env.example. Edit it to add your GEMINI_API_KEY!"
  cp .env.example .env
fi

# Start FastAPI
echo "🚀 Starting RAG service on http://localhost:8000"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

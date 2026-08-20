FROM python:3.11-slim

WORKDIR /app

# Install FFmpeg and OpenCV system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsm6 \
    libxext6 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend code
COPY . .

# Create storage directories
RUN mkdir -p storage/raw storage/audio storage/transcripts storage/summaries storage/embeddings

# Expose Hugging Face Space port
EXPOSE 7860

# Start FastAPI with Uvicorn on 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]

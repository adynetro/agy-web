FROM python:3.11-slim

# Install system utilities & curl for agy installer
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    procps \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Google Antigravity CLI
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Default port
EXPOSE 8000

ENV HOST="0.0.0.0"
ENV PORT=8000

CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

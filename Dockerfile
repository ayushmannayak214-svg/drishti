FROM node:20-slim

# Install Python 3, pip, and clean apt cache for minimal image footprint
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Symlink python -> python3 so both 'python' and 'python3' work
RUN ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Install required Python dependencies for the AI model
RUN pip3 install --no-cache-dir --break-system-packages pillow numpy || pip3 install --no-cache-dir pillow numpy

# Copy backend package manifests first for optimal Docker layer caching
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy application source files
COPY . .

# Ensure the upload directory exists
RUN mkdir -p backend/uploads

# Expose default port
ENV PORT=5000
EXPOSE 5000

# Start DRISHTI server
CMD ["node", "backend/server.js"]

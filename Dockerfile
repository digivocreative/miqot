# Gunakan image Node.js yang stabil
FROM node:20-slim

# Instal library yang dibutuhkan untuk fitur modern-screenshot (Chromium dependencies)
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libxcomposite1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    ca-certificates \
    fonts-liberation \
    lsb-release \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files dan instal dependensi
COPY package*.json ./
RUN npm install

# Copy semua file project
COPY . .

# Build aplikasi (asumsi menggunakan Next.js/Vite/Remix)
RUN npm run build

# Ekspos port aplikasi (biasanya 3000)
EXPOSE 3000

# Jalankan aplikasi
CMD ["npm", "start"]
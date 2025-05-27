import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, 'ssl/key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, 'ssl/cert.pem')),
    },
    host: true,
    port: 5173,
    proxy: {
      '/generate': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});

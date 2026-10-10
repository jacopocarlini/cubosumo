import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/ws': {target: 'ws://127.0.0.1:3001', ws: true},
    },
  },
});

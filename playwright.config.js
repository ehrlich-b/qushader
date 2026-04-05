import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5174',
    // WebGL needs a real GPU context — use headed or SwiftShader
    launchOptions: {
      args: [
        '--enable-webgl',
        '--use-gl=swiftshader',
        '--enable-unsafe-webgpu',
      ],
    },
  },
  webServer: {
    command: 'npx vite --port 5174',
    port: 5174,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});

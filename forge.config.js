const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { spawn } = require('node:child_process');

function runElectronViteBuild() {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const child = spawn(isWindows ? 'npm run build' : 'npm', isWindows ? [] : ['run', 'build'], {
      stdio: 'inherit',
      // Windows launches npm through npm.cmd, which requires a command shell.
      shell: isWindows,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `electron-vite build failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
        ),
      );
    });
  });
}

module.exports = {
  // electron-vite writes the application bundle to ./out. Forge must use a
  // different directory or Electron Packager removes the app entry point.
  outDir: 'forge-out',
  hooks: {
    prePackage: runElectronViteBuild,
  },
  packagerConfig: {
    asar: true,
    // Forge defaults to ignoring /out because it normally stores its own
    // artifacts there. Here /out is the electron-vite application bundle.
    ignore: [/^\/(?:forge-out|dist|src)(?:\/|$)/],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

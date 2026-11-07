module.exports = {
  appId: 'io.freeter.app.swh',
  productName: 'Freeter-SWH',
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  files: [{
    from: './build',
    to: './'
  }, {
    from: './',
    to: './',
    filter: ['package.json']
  }],
  // node-pty is an N-API module: the binary from `yarn install` (prebuilt on Windows,
  // compiled on Linux) loads in Electron as is. Rebuilding it for Electron fails on Windows
  // (its winpty build step), so the rebuild is skipped.
  npmRebuild: false,
  // `freeter` CLI wrappers, outside app.asar so a shell can run them.
  extraResources: [{
    from: 'resources/bin',
    to: 'bin'
  }],
  win: {
    target: [
      {
        target: 'msi',
        arch: ['x64']
      },
      {
        target: 'zip',
        arch: ['x64']
      }
    ],
    icon: 'resources/win32/freeter.ico',
    publish: ['github'],
  },
  linux: {
    target: [
      {
        target: 'tar.xz',
        arch: ['x64']
      }
    ],
    icon: 'resources/linux/freeter-icons',
    publish: ['github'],
  }
}

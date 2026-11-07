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

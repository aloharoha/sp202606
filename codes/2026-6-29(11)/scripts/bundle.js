// renderer.js + three.js + GLTFLoader 를 하나의 IIFE 파일로 번들링.
// 런타임 dynamic import 를 없애 패키지 앱에서 GLTFLoader 로드 실패를 근본 차단.
const esbuild = require('esbuild');
const path = require('path');

const root = path.join(__dirname, '..');

Promise.all([
  // Renderer: browser platform
  esbuild.build({
    entryPoints: [path.join(root, 'renderer.js')],
    bundle: true,
    outfile: path.join(root, 'renderer.bundle.js'),
    format: 'iife',
    platform: 'browser',
    target: ['chrome126'], // Electron 31
  }),

  // Main: node platform (fs, path 포함)
  esbuild.build({
    entryPoints: [path.join(root, 'main.js')],
    bundle: true,
    outfile: path.join(root, 'main.bundle.js'),
    format: 'cjs',
    platform: 'node',
    target: ['node20'],
    external: ['electron'], // electron은 runtime에서 제공
  }),
]).then(() => {
  console.log('renderer.bundle.js, main.bundle.js 빌드 완료');
}).catch(() => process.exit(1));

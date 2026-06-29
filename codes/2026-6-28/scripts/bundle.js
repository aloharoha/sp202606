// renderer.js + three.js + GLTFLoader 를 하나의 IIFE 파일로 번들링.
// 런타임 dynamic import 를 없애 패키지 앱에서 GLTFLoader 로드 실패를 근본 차단.
const esbuild = require('esbuild');
const path = require('path');

const root = path.join(__dirname, '..');

esbuild.build({
  entryPoints: [path.join(root, 'renderer.js')],
  bundle: true,
  outfile: path.join(root, 'renderer.bundle.js'),
  format: 'iife',
  platform: 'browser',
  target: ['chrome126'], // Electron 31
  // 번들에 three + GLTFLoader 전부 포함 — external 없음
}).then(() => {
  console.log('renderer.bundle.js 빌드 완료');
}).catch(() => process.exit(1));

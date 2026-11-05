// Runs after `npx cap add android`: copies icons/splash and stamps the version from package.json.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

const resSrc = path.join(root, 'resources', 'android', 'res');
if (fs.existsSync(resSrc)) {
  fs.cpSync(resSrc, path.join(root, 'android', 'app', 'src', 'main', 'res'), { recursive: true, force: true });
  console.log('Android icons and splash screens copied');
}

const versionCode = parseInt(process.env.VERSION_CODE || '1', 10);
let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
fs.writeFileSync(gradlePath, gradle);
console.log(`build.gradle: versionCode ${versionCode}, versionName ${pkg.version}`);

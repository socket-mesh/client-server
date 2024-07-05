import fs from 'fs';
import Path from 'path';

function rmDirSync(path) {
	if (fs.existsSync(path)) {
		fs.readdirSync(path).forEach((file, index) => {
			const curPath = Path.join(path, file);
			if (fs.lstatSync(curPath).isDirectory()) { // recurse
				rmDirSync(curPath);
			} else { // delete file
				fs.unlinkSync(curPath);
			}
		});
		fs.rmdirSync(path);
	}
}

function removeDistFromPackageJson() {
	const buffer = fs.readFileSync(`${process.cwd()}/dist/package.json`);

	try {
		const packageJson = JSON.parse(buffer.toString());

		if (typeof packageJson.module === 'string' && packageJson.module.startsWith('src/')) {
			packageJson.module = packageJson.module.substring(4);
		}

		if (typeof packageJson.types === 'string' && packageJson.types.startsWith('src/')) {
			packageJson.types = packageJson.types.substring(4);
		}

		fs.writeFileSync(`${process.cwd()}/dist/package.json`, JSON.stringify(packageJson, null, '\t'));
	} catch (err) {
		console.log('Failed while reading package.json');
	}
}

if (fs.existsSync(`${process.cwd()}/dist`)) {
	rmDirSync(`${process.cwd()}/dist`, { recursive: true });
}

fs.mkdirSync(`${process.cwd()}/dist`);
fs.copyFileSync(`${process.cwd()}/package.json`, `${process.cwd()}/dist/package.json`);
fs.copyFileSync(`${process.cwd()}/README.md`, `${process.cwd()}/dist/README.md`);
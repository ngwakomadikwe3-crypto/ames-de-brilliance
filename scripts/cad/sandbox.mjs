import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { basename } from 'node:path';

/** The trusted controller has Docker access; the importer container never does. */
export async function runSandbox(directory) {
  const image = process.env.AMES_CAD_IMAGE;
  if (!image || !/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Set AMES_CAD_IMAGE to a reviewed image digest');
  const dir = await realpath(directory);
  const id = basename(dir);
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid sandbox job directory');
  const uid = process.getuid?.(), gid = process.getgid?.();
  if (!uid || gid == null) throw new Error('Run the CAD controller as a dedicated non-root Linux user');
  const name = `ames-cad-${id}`;
  const args = ['run', '--rm', '--name', name, '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=4g', '--memory-swap=4g', '--cpus=2', '--user', `${uid}:${gid}`, '--tmpfs', '/tmp:rw,noexec,nosuid,size=512m', '--mount', `type=bind,src=${dir},dst=/job`, image];
  await new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false;
    const collect = data => { output = (output + data.toString()).slice(-4000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timeout = setTimeout(() => {
      timedOut = true;
      const removal = spawn('docker', ['rm', '-f', name], { stdio: 'ignore' });
      removal.on('error', () => {});
      child.kill();
      reject(new Error('CAD sandbox exceeded five minutes'));
    }, 300000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); if (timedOut) return; if (code === 0) resolve(); else reject(new Error(`CAD sandbox failed: ${output.slice(-1000)}`)); });
  });
}

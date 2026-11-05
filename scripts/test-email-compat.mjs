import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import nodemailer from 'nodemailer';

test('sourcing notification composes with the installed Nodemailer without sending mail', async () => {
  const source = await readFile(new URL('../src/lib/email.ts', import.meta.url), 'utf8');
  const exports = {};
  let result;
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, {
    exports,
    require(name) {
      assert.equal(name, 'nodemailer');
      return { createTransport(options) {
        assert.equal(options.host, 'smtp.example.test');
        assert.equal(options.secure, true);
        return { async sendMail(message) { result = await transport.sendMail(message); return result; } };
      } };
    },
    process: { env: { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '465', SMTP_USER: 'desk@example.test', SMTP_FROM: 'desk@example.test', NOTIFY_EMAIL: 'operator@example.test' } },
    console: { log() {}, error() {} },
  });
  assert.equal(await exports.sendSourcingNotification({
    id: 'test-request', buyer_name: 'Test buyer', company: 'Test jeweller', country: 'Botswana', contact: 'buyer@example.test',
    type: 'polished', shape: 'Round', carat_min: '1', carat_max: '2', color: 'D', clarity: 'VS1', certification: 'GIA', notes: 'Compatibility check',
  }), true);
  assert.deepEqual(result.envelope.to, ['operator@example.test']);
  assert.equal(result.envelope.from, 'desk@example.test');
  assert.match(result.message.toString(), /Compatibility check/);
  assert.match(result.message.toString(), /test-request/);
});

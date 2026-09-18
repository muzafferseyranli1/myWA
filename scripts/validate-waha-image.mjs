const image = process.env.WAHA_IMAGE || '';
if (!/^devlikeapro\/waha(?::[^@]+)?@sha256:[a-f0-9]{64}$/.test(image)) {
  console.error('WAHA_IMAGE must contain a verified devlikeapro/waha image digest.');
  process.exit(1);
}

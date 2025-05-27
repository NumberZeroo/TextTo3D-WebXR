// generate-cert.js
const { writeFileSync } = require('fs');
const selfsigned = require('selfsigned');

const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365 });

const path = require('path');

writeFileSync(path.join(__dirname, 'cert.pem'), pems.cert);
writeFileSync(path.join(__dirname, 'key.pem'), pems.private);


console.log('✅ Certificato generato in ssl/');

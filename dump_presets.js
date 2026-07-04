const mongoose = require('mongoose');
const ContestPreset = require('./src/models/ContestPreset').default;
const dbConnect = require('./src/lib/mongodb').default;

async function run() {
  await dbConnect();
  const presets = await ContestPreset.find();
  console.log(JSON.stringify(presets, null, 2));
  process.exit(0);
}
run();

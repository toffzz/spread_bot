import parse from 'csv-parse';
import fs from 'fs';

const file = './stats.csv'

const parser = parse({
  delimiter: ','
})

fs.readFile(file, 'utf8', function(err, data) {
  if (err) throw err;
  console.log('OK: ' + file);
  console.log(data)
});

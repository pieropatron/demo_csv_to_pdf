import {csv_to_pdf} from '../index';

csv_to_pdf(__dirname + '/example.csv').then(()=>{
	console.log("converted");
	process.exit(0);
}, error=>{
	console.error(error);
	process.exit(1);
});

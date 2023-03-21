import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as iconv from 'iconv-lite';
import { default as PDFDocument } from 'pdfkit';
import {pipeline} from 'stream/promises';

type ParsedCSV = {
	header: string[],
	header_info: string[][],
	table_header: string[],
	table_rows: string[][],
	summaries: string[]
}

const parse_csv = async (csv_filename: string)=>{
	const buffer = await fsp.readFile(csv_filename);
	const data = iconv.decode(buffer, 'CP-1251');

	const _arlines = data.split('\r\n');
	while (_arlines.length && !_arlines[_arlines.length - 1]) _arlines.pop();

	const miss_empty = () => {
		while (_arlines.length && !_arlines[0]) _arlines.shift();
	};

	const shift = () => {
		const line = _arlines.shift();
		if (!line) return [];
		const result = line.split(";");
		return result.map(cell=>{
			return cell.trim().replace(/[ ][ ]+/g, " ");
		});
	};

	miss_empty();

	const parsed: ParsedCSV = {
		header: [],
		header_info: [],
		table_header: [],
		table_rows: [],
		summaries: []
	};

	parsed.header = shift();
	miss_empty();

	parsed.header_info = [];
	for (let i = 0; i < 3; i++) {
		parsed.header_info.push(shift());
	}

	miss_empty();

	parsed.table_header = shift();
	_arlines.shift();
	parsed.table_rows = [];
	while (_arlines.length > 3) {
		parsed.table_rows.push(shift());
	}
	miss_empty();
	parsed.summaries = _arlines;
	miss_empty();

	return parsed;
};

const build_pdf = async (parsed: ParsedCSV, csv_filename: string)=>{
	const pdf_filename = csv_filename.replace(/csv$/i, 'pdf');

	const top = 20, left = 20;
	const page_options = {
		size: [842, 595],
		margins: {
			top,
			bottom: top,
			left,
			right: top
		}
	};
	const page_right = page_options.size[0] - page_options.margins.right;
	const page_bottom = page_options.size[1] - page_options.margins.bottom;
	const doc = new PDFDocument(page_options);
	const font_sz = 8.5, line_width = 0.5;
	doc
		.font('c:/Windows/Fonts/calibri.ttf')
		.fontSize(font_sz)
		.lineWidth(line_width)
		;

	const footer_top_margin = 19;
	const footer_height = (doc.heightOfString(parsed.summaries[0]) * parsed.summaries.length) + footer_top_margin;

	const width_max = 90, width_min = 60;

	const _arwidth = parsed.table_header.map(() => width_min);

	_arwidth[0] = width_max;
	_arwidth[2] = width_max;
	_arwidth[5] = width_max;
	_arwidth[7] = 45;
	_arwidth[8] = 55;

	const _arverticals = [left];
	for (let i = 0; i < _arwidth.length - 1; i++) {
		_arverticals.push(_arverticals[_arverticals.length - 1] + _arwidth[i]);
	}

	_arverticals.push(page_right);

	doc
		.text(parsed.header[0], left, top, { width: _arwidth[0] })
		.text(parsed.header[1], left + _arwidth[0], top)
		.moveDown()
		.x = left;

	parsed.header_info.forEach(_arcells=>{
		let x = left;
		const y = doc.y;
		_arcells.forEach((text, key)=>{
			const width = _arwidth[key];
			doc.text(text, x, y, { width });
			x += width;
		});
		doc.x = left;
	});

	doc.moveDown();

	let next_y = doc.y;
	const line = () => {
		doc.moveTo(left, next_y);
		doc.lineTo(page_right, next_y).stroke();
	};
	line();
	const padding = 2;

	const _artabletextopts = _arwidth.map(width => {
		width = width - (2 * padding);
		return { width, valign: 'center', baseline: true };
	});

	let table_header_hight = 0;
	const min_row_h = 24.751953125;
	const last_idx = parsed.table_rows.length - 1;

	[parsed.table_header].concat(parsed.table_rows).forEach((_acells, idx)=>{
		let x = left, y = next_y;

		// get next_y to check if new page required
		let row_hight = 0;
		_acells.forEach((text, key)=>{
			row_hight = Math.max(doc.heightOfString(text, _artabletextopts[key]) + (2 * padding), row_hight);
		});

		if (idx === 0) table_header_hight = row_hight;
		else row_hight = Math.max(row_hight, min_row_h);

		const next_high = idx === last_idx ? footer_height : 0;

		if (y + row_hight + next_high >= page_bottom) {
			doc.addPage(page_options).lineWidth(line_width);
			doc.moveTo(left, top);
			x = left;
			y = top;
			doc.moveTo(left, top).lineTo(page_right, top).stroke();

			parsed.table_header.forEach((text, key) => {
				doc.text(text, x + padding, y + padding, _artabletextopts[key]);
				x += _arwidth[key];
			});

			y = top + table_header_hight;
			_arverticals.forEach(left=>{
				doc.moveTo(left, top).lineTo(left, y).stroke();
			});

			doc.moveTo(left, y).lineTo(page_right, y).stroke();
			x = left;
		}

		_acells.forEach((text, key)=>{
			doc.text(text, x + padding, y + padding, _artabletextopts[key]);
			x += _arwidth[key];
		});

		next_y = y + row_hight;

		_arverticals.forEach(left=>{
			doc.moveTo(left, y).lineTo(left, next_y).stroke();
		});

		line();
		doc.x = left;
	});

	doc.y = next_y + footer_top_margin;

	parsed.summaries.forEach(text => {
		const _ar = text.split(" ");
		const num = _ar.pop();
		doc.text(_ar.join(" "), { lineBreak: false, width: _arwidth[0] });
		doc.moveUp();
		doc.text(num, _arverticals[1]);
		doc.x = left;
	});

	doc.save();
	doc.end();
	return pipeline(doc, fs.createWriteStream(pdf_filename));
};

export const csv_to_pdf = async (csv_filename: string)=>{
	const parsed = await parse_csv(csv_filename);
	await build_pdf(parsed, csv_filename);
};

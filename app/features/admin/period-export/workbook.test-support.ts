import yauzl from "yauzl";

/**
 * A downloaded workbook read back as its sheets' rows, for the export tests to
 * assert what the auditor gets. Text cells come back as text and number cells
 * as numbers (a date cell is its spreadsheet serial); an empty cell is `null`.
 */
export type WorkbookCell = number | string | null;

export async function readWorkbook(
  response: Response,
): Promise<Map<string, WorkbookCell[][]>> {
  const files = await unzip(Buffer.from(await response.arrayBuffer()));
  const sharedStrings = [
    ...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>(.*?)<\/si>/gs),
  ].map((match) => readText(match[1]));
  const sheetNames = [
    ...(files.get("xl/workbook.xml") ?? "").matchAll(
      /<sheet [^>]*name="([^"]*)"/g,
    ),
  ].map((match) => decodeXml(match[1]));
  const sheets = new Map<string, WorkbookCell[][]>();

  sheetNames.forEach((name, index) => {
    const xml = files.get(`xl/worksheets/sheet${index + 1}.xml`) ?? "";
    const rows = [...xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map((row) =>
      readRow(row[1], sharedStrings),
    );

    sheets.set(name, rows);
  });

  return sheets;
}

function readRow(xml: string, sharedStrings: string[]): WorkbookCell[] {
  const cells: WorkbookCell[] = [];

  for (const match of xml.matchAll(
    /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs,
  )) {
    const [, column, attributes, body = ""] = match;

    // A skipped column leaves a hole, which the return reads as empty.
    cells[columnIndex(column)] = readCell(attributes, body, sharedStrings);
  }

  return Array.from(cells, (cell) => cell ?? null);
}

function readCell(
  attributes: string,
  body: string,
  sharedStrings: string[],
): WorkbookCell {
  const type = /t="([^"]+)"/.exec(attributes)?.[1];
  const value = /<v>(.*?)<\/v>/s.exec(body)?.[1];

  if (type === "inlineStr" || type === "str") {
    return readText(body);
  }

  if (value === undefined) {
    return null;
  }

  return type === "s" ? (sharedStrings[Number(value)] ?? null) : Number(value);
}

function columnIndex(column: string) {
  return (
    [...column].reduce(
      (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
      0,
    ) - 1
  );
}

function readText(xml: string) {
  return decodeXml(
    [...xml.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((match) => match[1]).join(""),
  );
}

function decodeXml(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function unzip(bytes: Buffer) {
  return await new Promise<Map<string, string>>((resolve, reject) => {
    const files = new Map<string, string>();

    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) {
        reject(error);
        return;
      }

      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            reject(streamError);
            return;
          }

          const chunks: Buffer[] = [];

          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            files.set(entry.fileName, Buffer.concat(chunks).toString());
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(files));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

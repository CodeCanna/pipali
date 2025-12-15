import path from 'path';
import os from 'os';
import { resolveCaseInsensitivePath } from './actor.utils';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx';
import * as XLSX from 'xlsx';

export interface ReadFileArgs {
    path: string;
    start_line?: number;
    end_line?: number;
}

export interface FileContentResult {
    query: string;
    file: string;
    uri: string;
    compiled: string | Array<{ type: string; [key: string]: any }>;
    isImage?: boolean;
}

// Supported image formats
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

// Supported document formats
const PDF_EXTENSION = '.pdf';
const DOCX_EXTENSIONS = ['.docx', '.doc'];
const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
const PPT_EXTENSIONS = ['.pptx', '.ppt'];

/**
 * Check if a file path is an image based on extension
 */
function isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Check if a file path is a PDF based on extension
 */
function isPdfFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === PDF_EXTENSION;
}

/**
 * Check if a file path is a Word document based on extension
 */
function IsWordDoc(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return DOCX_EXTENSIONS.includes(ext);
}

/**
 * Check if a file path is an Excel spreadsheet based on extension
 */
function isExcelFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return EXCEL_EXTENSIONS.includes(ext);
}

/**
 * Check if a file path is a PowerPoint presentation based on extension
 */
function isPptFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return PPT_EXTENSIONS.includes(ext);
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * View the contents of a file with optional line range specification
 */
export async function readFile(args: ReadFileArgs): Promise<FileContentResult> {
    const { path: filePath, start_line, end_line } = args;

    let query = `View file: ${filePath}`;
    if (start_line && end_line) {
        query += ` (lines ${start_line}-${end_line})`;
    }

    try {
        // Resolve to absolute path (relative paths resolve relative to home folder)
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(os.homedir(), filePath);

        // Read the file using Bun.file
        let resolvedPath = absolutePath;
        let file = Bun.file(resolvedPath);
        let exists = await file.exists();

        // If the exact-cased path doesn't exist, try resolving case-insensitively.
        if (!exists) {
            const caseResolved = await resolveCaseInsensitivePath(path.normalize(absolutePath));
            if (caseResolved) {
                resolvedPath = caseResolved;
                file = Bun.file(resolvedPath);
                exists = await file.exists();
            }
        }

        if (!exists) {
            return {
                query,
                file: filePath,
                uri: filePath,
                compiled: `File '${filePath}' not found`,
            };
        }

        // Check if file is an image
        if (isImageFile(resolvedPath)) {
            try {
                // Read image as array buffer and convert to base64
                console.log(`[Image] Reading: ${resolvedPath}`);
                const arrayBuffer = await file.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = getMimeType(resolvedPath);
                // const dataUrl = `data:${mimeType};base64,${base64}`;
                console.log(`[Image] Encoded: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB as ${mimeType}`);

                // Return multimodal content for vision-enabled models
                return {
                    query,
                    file: filePath,
                    uri: filePath,
                    compiled: [
                        {
                            type: 'text',
                            text: `Read image file: ${filePath}\nSize: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB\nFormat: ${mimeType}`
                        },
                        {
                            type: 'image',
                            source_type: 'base64',
                            mime_type: mimeType,
                            data: base64,
                        }
                    ],
                    isImage: true,
                };
            } catch (imageError) {
                console.error(`[Image] Error reading ${filePath}:`, imageError);
                return {
                    query,
                    file: filePath,
                    uri: filePath,
                    compiled: `Error reading image file ${filePath}: ${imageError instanceof Error ? imageError.message : String(imageError)}`,
                };
            }
        }

        // Check if file is a PDF
        if (isPdfFile(resolvedPath)) {
            try {
                console.log(`[PDF] Reading: ${resolvedPath}`);
                const loader = new PDFLoader(resolvedPath, {
                    splitPages: false, // Load entire PDF as single document
                });
                const docs = await loader.load();

                if (docs.length === 0) {
                    return {
                        query,
                        file: filePath,
                        uri: filePath,
                        compiled: `PDF file '${filePath}' contains no readable text content.`,
                    };
                }

                // Combine all document content
                const pdfText = docs.map(doc => doc.pageContent).join('\n\n');
                const pageCount = (docs[0]?.metadata as any)?.pdf?.totalPages || docs.length;
                console.log(`[PDF] Extracted ${pdfText.length} characters from ${pageCount} page(s)`);

                // Apply line range filtering if specified
                const lines = pdfText.split('\n');
                const startIdx = (start_line || 1) - 1;
                const endIdx = end_line || lines.length;

                if (startIdx < 0 || startIdx >= lines.length) {
                    return {
                        query,
                        file: filePath,
                        uri: filePath,
                        compiled: `Invalid start_line: ${start_line}. PDF has ${lines.length} lines.`,
                    };
                }

                let actualEndIdx = Math.min(endIdx, lines.length);
                let truncationMessage = '';

                if (actualEndIdx - startIdx > 50) {
                    truncationMessage = '\n\n[Truncated after 50 lines! Use narrower line range to view complete section.]';
                    actualEndIdx = startIdx + 50;
                }

                const selectedLines = lines.slice(startIdx, actualEndIdx);
                const filteredText = `[PDF: ${pageCount} page(s)]\n\n` + selectedLines.join('\n') + truncationMessage;

                return {
                    query,
                    file: filePath,
                    uri: filePath,
                    compiled: filteredText,
                };
            } catch (pdfError) {
                console.error(`[PDF] Error reading ${filePath}:`, pdfError);
                return {
                    query,
                    file: filePath,
                    uri: filePath,
                    compiled: `Error reading PDF file ${filePath}: ${pdfError instanceof Error ? pdfError.message : String(pdfError)}`,
                };
            }
        }

        // Check if file is a Word document
        if (IsWordDoc(resolvedPath)) {
            try {
                console.log(`[DOCX] Reading: ${resolvedPath}`);
                const loader = new DocxLoader(resolvedPath);
                const docs = await loader.load();

                if (docs.length === 0) {
                    return {
                        query,
                        file: filePath,
                        uri: filePath,
                        compiled: `Word document '${filePath}' contains no readable text content.`,
                    };
                }

                const docText = docs.map(doc => doc.pageContent).join('\n\n');
                console.log(`[DOCX] Extracted ${docText.length} characters`);

                // Apply line range filtering if specified
                const lines = docText.split('\n');
                const startIdx = (start_line || 1) - 1;
                const endIdx = end_line || lines.length;

                if (startIdx < 0 || startIdx >= lines.length) {
                    return {
                        query,
                        file: filePath,
                        uri: filePath,
                        compiled: `Invalid start_line: ${start_line}. Document has ${lines.length} lines.`,
                    };
                }

                let actualEndIdx = Math.min(endIdx, lines.length);
                let truncationMessage = '';

                if (actualEndIdx - startIdx > 50) {
                    truncationMessage = '\n\n[Truncated after 50 lines! Use narrower line range to view complete section.]';
                    actualEndIdx = startIdx + 50;
                }

                const selectedLines = lines.slice(startIdx, actualEndIdx);
                const filteredText = `[Word Document]\n\n` + selectedLines.join('\n') + truncationMessage;

                return {
                    query,
                    file: filePath,
                    uri: filePath,
                    compiled: filteredText,
                };
            } catch (docxError) {
                console.error(`[DOCX] Error reading ${filePath}:`, docxError);
                return {
                    query,
                    file: filePath,
                    uri: filePath,
                    compiled: `Error reading Word document ${filePath}: ${docxError instanceof Error ? docxError.message : String(docxError)}`,
                };
            }
        }

        // Check if file is an Excel spreadsheet
        if (isExcelFile(resolvedPath)) {
            try {
                console.log(`[XLSX] Reading: ${resolvedPath}`);
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                const sheetNames = workbook.SheetNames;
                if (sheetNames.length === 0) {
                    return {
                        query,
                        file: filePath,
                        uri: filePath,
                        compiled: `Excel file '${filePath}' contains no sheets.`,
                    };
                }

                // Convert all sheets to text
                const sheetsText: string[] = [];
                for (const sheetName of sheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    if (sheet) {
                        const csv = XLSX.utils.sheet_to_csv(sheet);
                        sheetsText.push(`--- Sheet: ${sheetName} ---\n${csv}`);
                    }
                }

                const xlsxText = sheetsText.join('\n\n');
                console.log(`[XLSX] Extracted ${xlsxText.length} characters from ${sheetNames.length} sheet(s)`);

                // Apply line range filtering if specified
                const lines = xlsxText.split('\n');
                const startIdx = (start_line || 1) - 1;
                const endIdx = end_line || lines.length;

                if (startIdx < 0 || startIdx >= lines.length) {
                    return {
                        query,
                        file: filePath,
                        uri: filePath,
                        compiled: `Invalid start_line: ${start_line}. Spreadsheet has ${lines.length} lines.`,
                    };
                }

                let actualEndIdx = Math.min(endIdx, lines.length);
                let truncationMessage = '';

                if (actualEndIdx - startIdx > 50) {
                    truncationMessage = '\n\n[Truncated after 50 lines! Use narrower line range to view complete section.]';
                    actualEndIdx = startIdx + 50;
                }

                const selectedLines = lines.slice(startIdx, actualEndIdx);
                const filteredText = `[Excel: ${sheetNames.length} sheet(s)]\n\n` + selectedLines.join('\n') + truncationMessage;

                return {
                    query,
                    file: filePath,
                    uri: filePath,
                    compiled: filteredText,
                };
            } catch (excelError) {
                console.error(`[Excel] Error reading ${filePath}:`, excelError);
                return {
                    query,
                    file: filePath,
                    uri: filePath,
                    compiled: `Error reading Excel file ${filePath}: ${excelError instanceof Error ? excelError.message : String(excelError)}`,
                };
            }
        }

        // Check if file is a PowerPoint presentation
        if (isPptFile(resolvedPath)) {
            try {
                console.log(`[PPT] Reading: ${resolvedPath}`);
                const loader = new PPTXLoader(resolvedPath);
                const docs = await loader.load();

                if (docs.length === 0) {
                    return {
                        query,
                        file: filePath,
                        uri: filePath,
                        compiled: `PowerPoint file '${filePath}' contains no readable text content.`,
                    };
                }

                const pptText = docs.map(doc => doc.pageContent).join('\n\n');
                console.log(`[PPT] Extracted ${pptText.length} characters`);

                // Apply line range filtering if specified
                const lines = pptText.split('\n');
                const startIdx = (start_line || 1) - 1;
                const endIdx = end_line || lines.length;

                if (startIdx < 0 || startIdx >= lines.length) {
                    return {
                        query,
                        file: filePath,
                        uri: filePath,
                        compiled: `Invalid start_line: ${start_line}. Presentation has ${lines.length} lines.`,
                    };
                }

                let actualEndIdx = Math.min(endIdx, lines.length);
                let truncationMessage = '';

                if (actualEndIdx - startIdx > 50) {
                    truncationMessage = '\n\n[Truncated after 50 lines! Use narrower line range to view complete section.]';
                    actualEndIdx = startIdx + 50;
                }

                const selectedLines = lines.slice(startIdx, actualEndIdx);
                const filteredText = `[PowerPoint Presentation]\n\n` + selectedLines.join('\n') + truncationMessage;

                return {
                    query,
                    file: filePath,
                    uri: filePath,
                    compiled: filteredText,
                };
            } catch (pptError) {
                console.error(`[PPT] Error reading ${filePath}:`, pptError);
                return {
                    query,
                    file: filePath,
                    uri: filePath,
                    compiled: `Error reading PowerPoint file ${filePath}: ${pptError instanceof Error ? pptError.message : String(pptError)}`,
                };
            }
        }

        // Read file content as text
        const rawText = await file.text();
        const lines = rawText.split('\n');

        // Apply line range filtering if specified
        const startIdx = (start_line || 1) - 1; // Convert to 0-based index
        const endIdx = end_line || lines.length;

        // Validate line range
        if (startIdx < 0 || startIdx >= lines.length) {
            return {
                query,
                file: filePath,
                uri: filePath,
                compiled: `Invalid start_line: ${start_line}. File has ${lines.length} lines.`,
            };
        }

        // Limit to first 50 lines if more than 50 lines are requested
        let actualEndIdx = Math.min(endIdx, lines.length);
        let truncationMessage = '';

        if (actualEndIdx - startIdx > 50) {
            truncationMessage = '\n\n[Truncated after 50 lines! Use narrower line range to view complete section.]';
            actualEndIdx = startIdx + 50;
        }

        const selectedLines = lines.slice(startIdx, actualEndIdx);
        const filteredText = selectedLines.join('\n') + truncationMessage;

        return {
            query,
            file: filePath,
            uri: filePath,
            compiled: filteredText,
        };
    } catch (error) {
        const errorMsg = `Error reading file ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg, error);

        return {
            query,
            file: filePath,
            uri: filePath,
            compiled: errorMsg,
        };
    }
}

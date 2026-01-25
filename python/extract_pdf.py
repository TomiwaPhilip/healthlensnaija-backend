#!/usr/bin/env python3
import sys
import json
import os
import re
import pdfplumber

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r"\n+", " ", text)
    text = re.sub(r"\s{2,}", " ", text)
    text = text.replace("- ", "").replace("-\n", "")
    text = re.sub(r"(?i)(www\.[a-z0-9.-]+|https?://\S+|Email:|TOLL-FREE CALL).*?", "", text)
    text = re.sub(r"PLOT \d+|@NCDCgov", "", text)
    text = re.sub(r"\b\d+\s*\|\s*Page\b", "", text)
    return text.strip()

def clean_table(table):
    cleaned_table = []
    for row in table:
        cleaned_row = [
            re.sub(r'[^a-zA-Z0-9\s\-,.%()/$:;]', '', cell).strip().replace("\n", " ") if cell else ""
            for cell in row
        ]
        if any(cleaned_row):
            cleaned_table.append(cleaned_row)
    return cleaned_table

def extract_text_and_tables(pdf_path):
    text_content = []
    tables_content = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                # Text
                try:
                    text = page.extract_text()
                    if text:
                        text_content.append(f"--- Page {i} ---\n{clean_text(text)}")
                except Exception:
                    continue
                # Tables
                try:
                    tables = page.extract_tables()
                    if tables:
                        for table in tables:
                            tables_content.append(clean_table(table))
                except Exception:
                    continue
    except Exception as e:
        return {
            "text": f"[pdfplumber failed: {str(e)}]",
            "tables": []
        }

    return {
        "text": "\n".join(text_content) if text_content else "[No extractable text found]",
        "tables": tables_content
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No PDF path provided"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(json.dumps({"error": "File not found"}))
        sys.exit(1)

    result = extract_text_and_tables(pdf_path)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0)

if __name__ == "__main__":
    main()

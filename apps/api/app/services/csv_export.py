"""Shared CSV rendering for /api/reports/*/csv endpoints."""
from __future__ import annotations

import csv
import io

from fastapi.responses import StreamingResponse


def rows_to_csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    buffer = io.StringIO()
    fieldnames = list(rows[0].keys()) if rows else []
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

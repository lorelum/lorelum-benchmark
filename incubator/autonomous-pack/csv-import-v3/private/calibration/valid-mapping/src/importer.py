import csv
from io import StringIO


def validate(row, accepted):
    if len(row) != 3:
        return "columns", None
    fields = tuple(map(str.strip, row))
    if not all(fields):
        return "required", None
    address = fields[2].split("@")
    if len(address) != 2 or not all(address):
        return "email", None
    if fields[0] in accepted:
        return "duplicate", None
    return None, dict(zip(("id", "name", "email"), fields))


def import_contacts(text):
    reader = csv.reader(StringIO(text, newline=""))
    if next(reader, None) != ["id", "name", "email"]:
        return {"error": "invalid_header"}
    accepted = {}
    errors = []
    for index, record in enumerate(reader, start=1):
        code, contact = validate(record, accepted)
        if code is None:
            accepted[contact["id"]] = contact
        else:
            errors.append({"row": index, "code": code})
    return {"contacts": list(accepted.values()), "errors": errors}

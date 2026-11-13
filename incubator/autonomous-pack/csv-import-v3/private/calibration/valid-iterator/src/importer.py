import csv
import io


def import_contacts(text):
    rows = csv.reader(io.StringIO(text, newline=""))
    if next(rows, None) != ["id", "name", "email"]:
        return {"error": "invalid_header"}
    contacts, errors, seen = [], [], set()
    for number, row in enumerate(rows, 1):
        if len(row) != 3:
            code = "columns"
        else:
            ident, name, email = (field.strip() for field in row)
            if not ident or not name or not email:
                code = "required"
            elif email.count("@") != 1 or not all(email.split("@")):
                code = "email"
            elif ident in seen:
                code = "duplicate"
            else:
                seen.add(ident)
                contacts.append({"id": ident, "name": name, "email": email})
                continue
        errors.append({"row": number, "code": code})
    return {"contacts": contacts, "errors": errors}

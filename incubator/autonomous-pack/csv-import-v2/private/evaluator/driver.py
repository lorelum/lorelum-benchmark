"""Private behavioral probes; communicate only through the verifier broker."""
import json
import sys


def check(number, csv_text, expected):
    print(json.dumps({"type": "call", "id": str(number), "input": {"csv": csv_text}}, ensure_ascii=True), flush=True)
    line = sys.stdin.readline()
    if not line:
        raise RuntimeError("broker closed before reply")
    reply = json.loads(line)
    if not isinstance(reply, dict) or reply.get("type") != "reply" or reply.get("id") != str(number) or "output" not in reply:
        raise RuntimeError("invalid broker reply")
    return json.dumps(reply["output"], sort_keys=True) == json.dumps(expected, sort_keys=True)


def main():
    cases = [
        ("", {"error": "invalid_header"}),
        ("id,email,name\na,x@y,X\n", {"error": "invalid_header"}),
        (" id,name,email\n", {"error": "invalid_header"}),
        ("id,name,email\n", {"contacts": [], "errors": []}),
        ("id,name,email\r\n 7 , Alice , alice@example.org \r\n8,Bob,b@c\r\n", {"contacts": [{"id": "7", "name": "Alice", "email": "alice@example.org"}, {"id": "8", "name": "Bob", "email": "b@c"}], "errors": []}),
        ('id,name,email\n1,"Doe, Jane",j@x\n2,"A ""quoted""\nname",b@y\n', {"contacts": [{"id": "1", "name": "Doe, Jane", "email": "j@x"}, {"id": "2", "name": 'A "quoted"\nname', "email": "b@y"}], "errors": []}),
        ("id,name,email\na,A,a@x\na,Again,a@y\nA,Case,c@x\n", {"contacts": [{"id": "a", "name": "A", "email": "a@x"}, {"id": "A", "name": "Case", "email": "c@x"}], "errors": [{"row": 2, "code": "duplicate"}]}),
        ("id,name,email\nx,,broken\nx,Good,x@y\nx,No,nope\nx,Again,x@y\n", {"contacts": [{"id": "x", "name": "Good", "email": "x@y"}], "errors": [{"row": 1, "code": "required"}, {"row": 3, "code": "email"}, {"row": 4, "code": "duplicate"}]}),
        ("id,name,email\n\n1,A\n2,B,b@c,extra\n3,C,@x\n4,D,x@\n5,E,x@y@z\n6,F,x@y\n", {"contacts": [{"id": "6", "name": "F", "email": "x@y"}], "errors": [{"row": 1, "code": "columns"}, {"row": 2, "code": "columns"}, {"row": 3, "code": "columns"}, {"row": 4, "code": "email"}, {"row": 5, "code": "email"}, {"row": 6, "code": "email"}]}),
        ('id,name,email\n1,"two\nlines",a@b\n2,,c@d\n', {"contacts": [{"id": "1", "name": "two\nlines", "email": "a@b"}], "errors": [{"row": 2, "code": "required"}]}),
        ("id,name,email\na,Fresh,a@x\n", {"contacts": [{"id": "a", "name": "Fresh", "email": "a@x"}], "errors": []}),
    ]
    passed = True
    for number, (text, expected) in enumerate(cases, 1):
        if not check(number, text, expected):
            passed = False
    print(json.dumps({"type": "result", "semantic": "pass" if passed else "fail"}), flush=True)


if __name__ == "__main__":
    main()

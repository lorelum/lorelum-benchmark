import json
import sys

from importer import import_contacts


def main():
    for line in sys.stdin:
        request = json.loads(line)
        print(json.dumps(import_contacts(request["csv"])), flush=True)


if __name__ == "__main__":
    main()

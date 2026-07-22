PREFIX ?= /usr/share/cockpit
NAME = manifest
INSTALL_DIR = $(PREFIX)/$(NAME)
SYSCONF ?= /etc/cockpit/$(NAME)
VERSION := $(shell cat VERSION)
TAG := v$(VERSION)
RELEASE_NOTES ?= Release $(VERSION)
export RELEASE_NOTES

FILES = manifest.json index.html README.md CHANGELOG.md VERSION Makefile css js html

.PHONY: all install uninstall zip publish clean help version

all: help

help:
	@echo "manifest plugin — version $(VERSION)"
	@echo "  make install    Copy plugin to $(INSTALL_DIR) (use sudo)"
	@echo "  make uninstall  Remove plugin (use sudo)"
	@echo "  make zip        Produce manifest-$(VERSION).zip"
	@echo "  make publish    Publish zip as GitHub release $(TAG)"
	@echo "  make version    Print current version"

version:
	@echo $(VERSION)

install:
	@if [ "$$(id -u)" != "0" ]; then echo "install requires root (use sudo)"; exit 1; fi
	@if [ -d $(INSTALL_DIR) ]; then echo "Removing previous install"; rm -rf $(INSTALL_DIR); fi
	install -d $(INSTALL_DIR)
	@# Copy only FILES that exist — the plugin is built incrementally, so dirs
	@# like html/ may not exist in early phases; a missing entry must not abort.
	@for f in $(FILES); do if [ -e "$$f" ]; then cp -r "$$f" $(INSTALL_DIR)/; fi; done
	install -d $(SYSCONF)
	printf '%s\n' "$(VERSION)" > $(SYSCONF)/installed-version
	@echo "Installed manifest $(VERSION) to $(INSTALL_DIR)"
	@echo "Restart Cockpit with: systemctl try-restart cockpit"

uninstall:
	@if [ "$$(id -u)" != "0" ]; then echo "uninstall requires root (use sudo)"; exit 1; fi
	rm -rf $(INSTALL_DIR)
	@echo "Removed $(INSTALL_DIR)"

zip:
	@tmp=$$(mktemp -d); \
	mkdir "$$tmp/manifest"; \
	for f in $(FILES); do [ -e "$$f" ] && cp -r "$$f" "$$tmp/manifest/"; done; \
	(cd "$$tmp" && zip -rq "manifest-$(VERSION).zip" manifest); \
	mv "$$tmp/manifest-$(VERSION).zip" .; \
	rm -rf "$$tmp"; \
	echo "Wrote manifest-$(VERSION).zip"

publish: zip
	@command -v gh >/dev/null 2>&1 || { echo "gh CLI not found"; exit 1; }
	@gh auth status >/dev/null 2>&1 || { echo "gh not authenticated — run: gh auth login"; exit 1; }
	@notes="$$(mktemp)"; trap 'rm -f "$$notes"' EXIT; \
	printf '%s\n' "$$RELEASE_NOTES" > "$$notes"; \
	if gh release view "$(TAG)" >/dev/null 2>&1; then \
	  gh release upload "$(TAG)" "manifest-$(VERSION).zip" --clobber; \
	  gh release edit "$(TAG)" --notes-file "$$notes"; \
	else \
	  gh release create "$(TAG)" "manifest-$(VERSION).zip" --title "manifest $(VERSION)" --notes-file "$$notes"; \
	fi
	@rm -f "manifest-$(VERSION).zip"
	@echo "Published $(TAG)"

clean:
	rm -f manifest-*.zip

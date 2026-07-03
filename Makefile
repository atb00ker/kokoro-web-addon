.PHONY: install install-js install-py setup build dev zip test clean format format-js format-py lint lint-js lint-py

PYTHON ?= python3

# bun > deno > pnpm > npm
PM := $(shell command -v bun >/dev/null 2>&1 && echo bun || (command -v deno >/dev/null 2>&1 && echo deno || (command -v pnpm >/dev/null 2>&1 && echo pnpm || (command -v npm >/dev/null 2>&1 && echo npm || echo none))))

install: install-js install-py

install-js:
ifeq ($(PM),none)
	@echo "No JS package manager found. Install bun, deno, pnpm, or npm."
	@exit 1
else ifeq ($(PM),deno)
	deno install
else
	$(PM) install
endif

install-py:
	@if command -v uv >/dev/null 2>&1; then \
		uv sync; \
	else \
		$(PYTHON) -m pip install -e ".[dev]"; \
	fi

define run_py_tool
	@if command -v uv >/dev/null 2>&1; then \
		uv run $(1); \
	else \
		$(1); \
	fi
endef

define run_py_test
	@if command -v uv >/dev/null 2>&1; then \
		PYTHONPATH=src uv run python -m unittest discover -s src/system/tests -p 'test_*.py'; \
	elif [ -x .venv/bin/python ]; then \
		PYTHONPATH=src .venv/bin/python -m unittest discover -s src/system/tests -p 'test_*.py'; \
	else \
		PYTHONPATH=src $(PYTHON) -m unittest discover -s src/system/tests -p 'test_*.py'; \
	fi
endef

setup: install
	$(call run_py_tool,kokoro-web-setup)

define run_js_script
	@if [ "$(PM)" = "none" ]; then \
		echo "No JS package manager found. Install bun, deno, pnpm, or npm."; \
		exit 1; \
	elif [ "$(PM)" = "deno" ]; then \
		deno task $(1); \
	else \
		$(PM) run $(1); \
	fi
endef

build:
	$(call run_js_script,build)

dev:
	$(call run_js_script,dev)

zip:
	$(call run_js_script,zip)

test:
	$(call run_js_script,test)
	$(call run_py_test)

format: format-js format-py

format-js:
	$(call run_js_script,format)

format-py:
	$(call run_py_tool,ruff format src/system)

lint: lint-js lint-py

lint-js:
	$(call run_js_script,lint)

lint-py:
	$(call run_py_tool,ruff check --fix src/system)
	$(call run_py_tool,basedpyright src/system)

clean:
	rm -rf .output .wxt dist .ruff_cache build src/*.egg-info kokoro_web.egg-info src/system/firefox_host.json src/system/chrome_host.json

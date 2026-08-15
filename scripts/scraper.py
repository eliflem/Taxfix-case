import os
import getpass
from google import genai
from playwright.sync_api import sync_playwright

def get_gemini_client():
    """Prompts for the Gemini API key securely if not already set."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("🔑 Gemini API Key not found in environment.")
        api_key = getpass.getpass("Enter your Gemini API Key (input will be hidden): ").strip()
        os.environ["GEMINI_API_KEY"] = api_key
    
    return genai.Client(api_key=api_key)

def find_working_model(client: genai.Client) -> str:
    """Auto-detects an active, working Gemini model for your API key."""
    candidates = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]
    print("🔍 Auto-detecting working Gemini model...")
    
    for model_name in candidates:
        try:
            client.models.generate_content(model=model_name, contents="ping")
            print(f"✅ Successfully selected model: '{model_name}'")
            return model_name
        except Exception:
            continue
            
    # Fallback: Query list of models from the API directly
    try:
        for m in client.models.list():
            if hasattr(m, 'supported_generation_methods') and "generateContent" in m.supported_generation_methods:
                clean_name = m.name.replace("models/", "")
                print(f"✅ Found working model from list: '{clean_name}'")
                return clean_name
    except Exception as e:
        print(f"⚠️ Could not list models: {e}")

    # Default fallback
    return "gemini-3.5-flash-lite"

def format_modal_with_ai(client: genai.Client, model_name: str, raw_modal_text: str) -> str:
    """Uses Gemini purely to clean up/format already-extracted modal text (not to detect it)."""
    prompt = f"""
    You are a documentation formatting assistant. Below is the raw text content
    scraped directly from a help/info modal on a web page.

    RAW MODAL TEXT:
    ---
    {raw_modal_text}
    ---

    TASK:
    Format it into a clean, easy-to-read Markdown section with:
    - **Title / Header**
    - **Explanations**
    - **Key bullet points, tax rules, or rates** (e.g., VAT rates, requirements)
    Keep the original wording — do not summarize or invent content, just structure it.
    Exclude only obvious UI chrome (e.g. a lone "Close" or "Start AI chat" line).
    """

    response = client.models.generate_content(
        model=model_name,
        contents=prompt
    )
    return response.text.strip()

def wait_for_modal(page, timeout_ms=1500):
    """
    Looks for a currently-visible modal/dialog element and returns its Locator,
    or None if nothing is showing. Since the user has already clicked the info
    icon manually before pressing Enter, this just needs to confirm the modal
    is there — timeout is short because there's no click animation to wait on.
    """
    candidate_selectors = [
        "[role='dialog']",
        "[role='alertdialog']",
        "[aria-modal='true']",
        "[class*='Modal']",
        "[class*='modal']",
        "[class*='Popup']",
        "[class*='popup']",
        "[class*='Sheet']",   # bottom-sheet style modals, common on mobile-first web apps
        "[class*='Drawer']",
    ]
    for selector in candidate_selectors:
        locator = page.locator(selector).last  # .last: newest-mounted modal if several match
        try:
            locator.wait_for(state="visible", timeout=timeout_ms)
            return locator
        except Exception:
            continue
    return None

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_filename = os.path.join(script_dir, "..", "data", "taxfix_scraped", "taxfix_info_guides.md")

    # Create/Touch the output file
    with open(output_filename, "a", encoding="utf-8") as f:
        pass

    client = get_gemini_client()
    active_model = find_working_model(client)

    with sync_playwright() as p:
        print("\n🚀 Launching Chromium browser...")
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to Taxfix...")
        page.goto("https://app.taxfix.de/")

        print("\n" + "="*50)
        input("👉 Log in / Register in Chromium, then press ENTER here once you're ready to start...")
        print("="*50 + "\n")

        screen_count = 1

        while True:
            print(f"\n--- Screen #{screen_count} ---")
            user_input = input(
                "👉 In Chromium: go to the question and click its info icon so the "
                "pop-up is showing.\n"
                "   Then press ENTER here to scrape it "
                "('s' = no pop-up on this screen, 'q' = quit): "
            )
            stripped = user_input.lower().strip()
            if stripped == 'q':
                print("Stopping scraper session.")
                break
            if stripped == 's':
                screen_count += 1
                continue

            try:
                # Capture Page Title
                heading_element = page.query_selector("h1, h2, [class*='title']")
                screen_title = heading_element.inner_text().strip() if heading_element else f"Screen {screen_count}"
                print(f"Screen Title: {screen_title}")

                # Read whatever modal is currently visible — no clicking involved
                modal = wait_for_modal(page)

                if modal:
                    raw_modal_text = modal.inner_text().strip()
                    print(f"✓ Modal detected ({len(raw_modal_text)} chars). Formatting with Gemini...")

                    formatted_markdown = format_modal_with_ai(client, active_model, raw_modal_text)

                    with open(output_filename, "a", encoding="utf-8") as f:
                        f.write(f"# {screen_title}\n\n")
                        f.write(formatted_markdown)
                        f.write("\n\n---\n\n")

                    print(f"✓ Extracted and saved info block to:\n  {output_filename}")
                else:
                    print("⚠️ No modal/dialog element found. Make sure the pop-up is open before pressing ENTER.")
                    print("   (If it IS open and this keeps happening, inspect its HTML and add the class to wait_for_modal's selector list.)")

            except Exception as e:
                print(f"❌ Handled error on Screen #{screen_count}: {e}")

            screen_count += 1

        browser.close()
        print(f"\n🎉 Done! Scraped file location:\n{output_filename}")

if __name__ == "__main__":
    main()
# Implementation Plan: Tetrascript64 Morse-Decimal-Binary Converter

## 1. Overview
The goal is to build a web-based English ⟷ Morse ⟷ Decimal ⟷ Binary converter wrapped tightly in the "Tetrascript64 Terminal" UI aesthetic from the provided reference files. The UI will exactly mirror the dark mode, CRT-style, hacker-terminal style. 

## 2. Core Conversion Algorithm
To achieve a perfectly reversible conversion process while answering the requirement of converting Morse directly into decimal, we will utilize a **Base-3 Encoding Algorithm**. This guarantees we do not lose characters (like leading dots) during mathematical base conversions.

### Forward Logic (English ➔ Binary)
1. **English to Morse**: Process each word by converting English alphabets into standard Morse. Separate letters with a space.
   - *Example*: `aarya` ➔ `.- .- .-. -.-- .-`
2. **Morse to Base-3**: Map the symbols into numeric Base-3 digits.
   - Space (letter separator) = `0`
   - Dot (`.`) = `1`
   - Dash (`-`) = `2`
   - *Example*: `.- .- .-. -.-- .-` ➔ `12012012102122012`
3. **Base-3 to Decimal**: Convert the Base-3 string representation to a Base-10 (Decimal) value. Note: we will use Javascript `BigInt` to support words of any length without precision loss.
   - *Example*: `12012012102122012` (Base 3) ➔ `71819870` (Decimal)
4. **Decimal to Binary**: Convert the Decimal `BigInt` into a Base-2 (Binary) string.
   - *Example*: `71819870` (Decimal) ➔ `100010001111000111111011110` (Binary)

### Reverse Logic (Binary ➔ English)
1. **Binary to Decimal**: Parse the Base-2 string back into a Decimal `BigInt`.
2. **Decimal to Base-3**: Output the string value of the `BigInt` in Base-3.
3. **Base-3 to Morse**: Translate digits back: `1` ➔ `.`, `2` ➔ `-`, `0` ➔ ` ` (space).
4. **Morse to English**: Decode the separated Morse code letters into an English string.

## 3. UI/UX Features and Interactions
The styles will be extracted completely from the provided HTML templates.
- **Theme Configuration**:
  - Backgrounds: Deep black (`#050505`) with CRT scanlines and subtle shadow vignettes.
  - Fonts: `JetBrains Mono` and `Space Grotesk`.
  - Colors: Utilizing terminal primary blue (`#30abe8`), terminal dim (`#93b6c8`), and text glow classes.
- **Interactive Terminal Input**:
  - A bottom-affixed active prompt featuring a custom blinking CSS cursor.
  - Commands interface: Typing `cmd encode <string>` triggers conversion to Binary. Typing `cmd decode <binary>` reverses it.
- **Step-by-step Visual Output**:
  When processing, the UI will print out each variable of the pipeline distinctly (showing the input, mapped morse, calculated decimal, and resulting binary stack).

## 4. Development Steps
- **1. Structure Setup**: Create the primary `index.html` encompassing the imported Tailwind config and CSS animations (CRT scanlines, scrollbars, text-glow).
- **2. JavaScript Engine Module**: Scaffold the `BigInt`-powered Math logic mapping the Morse ⟷ Base 3 ⟷ Decimal ⟷ Binary operations.
- **3. Terminal Input & DOM Handling**: Map the active command-line input to an event listener, parsing the string and generating styled output nodes injected into the `main` display area.
- **4. Polish Effects**: Add artificial text typing delays and system diag indicators to match the references provided in `stitch/code.html`.

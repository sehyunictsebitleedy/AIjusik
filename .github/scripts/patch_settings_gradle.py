import sys
import os

path = "settings.gradle"

with open(path, "r") as f:
    content = f.read()

print("=== settings.gradle (before patch) ===")
print(content)

if "expo-modules-core" not in content:
    include_line = '    includeBuild "../node_modules/expo-modules-core/android"'
    content = content.replace(
        "pluginManagement {",
        "pluginManagement {\n" + include_line
    )
    with open(path, "w") as f:
        f.write(content)
    print("Patched: expo-modules-core/android added")
else:
    print("Already contains expo-modules-core, skipping patch")

print("=== settings.gradle (after patch) ===")
print(content)

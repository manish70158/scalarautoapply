#!/bin/bash

# Close existing Chrome instances
osascript -e 'quit app "Google Chrome"'
sleep 2

# Start Chrome with remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 &

echo "Chrome started with remote debugging on port 9222"
echo "You can now run: npm run auth"

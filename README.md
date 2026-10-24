# HOOKI

Anonymous video and text chat for Uttarakhand. Node.js server + plain HTML front end.

## Run it on your computer

1. Install Node.js 18 or newer from https://nodejs.org
2. Open a terminal in this folder and run:

       npm install
       npm start

3. Open http://localhost:3000 in two browser windows (or one normal and one private window)
   and start a chat in both. They match each other.

Camera and microphone work on `localhost` and on `https` sites only.

## Put it online

Video needs HTTPS, so deploy to a host that gives you a https address, for example
Render, Railway or Fly.io (all can run `npm start` as is). Set the start command to `npm start`.
The server reads the `PORT` environment variable.

For video to work for every user, add a TURN server (for example coturn or a paid TURN
service) in `public/index.html`, in the `iceServers` list. Google's free STUN server alone
fails for some mobile networks.

## What is included

- 18+ confirmation, optional tags (man or woman, city, vibe)
- Matching with filters for gender, city and vibe
- Video (WebRTC) and text chat, mic and camera switches, Next, Report
- Three reports from different chats block a user's IP until the server restarts
- Recent list (last 5, 30 minutes) with "Ask to reconnect" and a rejoin prompt on the other side

## Not built yet

VIP and payments, stars and private starred chats, wallpapers, device pickers, audio balance
settings, phone layout polish, Uttarakhand-only location check, database and moderation tools.

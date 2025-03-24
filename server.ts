// The type this server sends to a client
type serverResponse = {
  responseType: "Connection" | "Data" | "Removed";
  data: player[] | string;
  spawnIndex?: number;
  spawns?: spawn[];
};

type projectileResponse = {
  responseType: "Projectile";
  data: projectile;
};

// The type for a player helicopter
type player = {
  id: string;
  playerName: string;
  spawnIndex: number;
  xPos: number;
  yPos: number;
  zPos: number;
  rotation: any;
  mass: number;
  main_rotor: any;
  tail_rotor: any;
  waypoint: number;
  waypoint_time: number;
  timestamp: number;
  helicopter_type: number;
  player_health: number;
};

type projectile = {
  id: string;
  xPos: number;
  yPos: number;
  zPos: number;
  rotation: any;
  xVel: number;
  yVel: number;
  zVel: number;
  type: number;
  timestamp: number;
  shooter: string;
}

// A spawnpoint
type spawn = {
  xPos: number;
  xHeliPos: number;
  radius: number;
};

// The array of players
let players: player[] = [];

// The initial spawn point of the helicopters from the unity spawn points
const origin: spawn = {
  xPos: 2060,
  radius: 37.3,
  xHeliPos: 2060,
};

// The array of spawn points
let spawns: spawn[] = [];

// The offset to multiply by to get the new spawn point distance
const offset = 5;

// The spawn index of the helicopter that last disconnected
// -1 indicates that it should spawn at the origin
let lastRemoved = -1;

const server = Bun.serve<{ id: string; playerName: string }>({
  hostname: "0.0.0.0",
  port: "8081",
  fetch(req, server) {
    const url = new URL(req.url);
    // Get a player name
    const playerName = url.searchParams.get("playerName") || "";

    server.upgrade(req, {
      data: { id: crypto.randomUUID(), playerName: playerName },
    });
  },
  websocket: {
    open(ws) {
      console.log(`Client ${ws.data.id}, ${ws.data.playerName} Connected!`);
      ws.subscribe("all-clients");

      // if the playerName is connected don't calculate the spawnPoint just send back a quit message
      if (ws.data.playerName === "Connection") {
        ws.send(JSON.stringify("connectionResponse"));
        return;
      }

      // calculate the direction to send the spawn points (left or right)
      // left if even, right if odd
      // players.length + 1 since the player has not been added yet
      let direction = (players.length + 1) % 2 === 0 ? -1 : 1;
      // calculate the length of how far the spawnpoints should be
      let length = Math.floor((players.length + 1) / 2) * direction;

      // If the first player - spawn at the origin
      if (players.length === 0) {
        spawns.push(origin);
      } else if (lastRemoved !== -1) {
        // if last removed is not -1 there is a space to fill
        // calculate that space and fill it
        direction = (lastRemoved + 1) % 2 === 0 ? -1 : 1;
        length = Math.floor((lastRemoved + 1) / 2) * direction;
        spawns.splice(lastRemoved, 0, {
          xPos: origin.xPos + (origin.radius + offset) * length,
          radius: origin.radius,
          xHeliPos: origin.xHeliPos + (origin.radius + offset) * length,
        });
      } else if (players.length !== 0) {
        // otherwise add the new space to the spawns array
        spawns.push({
          xPos: origin.xPos + (origin.radius + offset) * length,
          radius: origin.radius,
          xHeliPos: origin.xHeliPos + (origin.radius + offset) * length,
        });
      }

      // create a new helicopter player & add to array
      let newPlayer = {
        id: ws.data.id,
        playerName: ws.data.playerName,
        spawnIndex: lastRemoved !== -1 ? lastRemoved : spawns.length - 1,
        xPos: 0,
        yPos: 0,
        zPos: 0,
        rotation: undefined,
        mass: 0,
        timestamp: 0,
        main_rotor: undefined,
        tail_rotor: undefined,
        waypoint: 0,
        waypoint_time: 0.0,
        helicopter_type: 0,
        player_health: 100,
      };
      players.push(newPlayer);

      lastRemoved = -1;

      // send the connection information to the client
      const connectionResponse: serverResponse = {
        responseType: "Connection",
        data: ws.data.id,
        spawns: spawns,
        spawnIndex: newPlayer.spawnIndex,
      };
      ws.send(JSON.stringify(connectionResponse));
    },

    // this is called when a message is received
    message(ws, message) {

      //console.log( `Message: ${message.toString()} from ${ws.data.id}, PlayerName: ${ws.data.playerName}` );

      const json = JSON.parse(message.toString());

      if (json.responseType === "Projectile") {
        const data = JSON.parse(json.data) as projectile;
      
        console.log(
          `Projectile RAW: ${JSON.stringify(data)} \nSpecifics: ${data.xPos}, ${data.yPos}, ${data.zPos}`
        );
      
        server.publish("all-clients", JSON.stringify(json));
      }

      else 
      {
        // decode the message
        const data = JSON.parse(message.toString()) as player;
  
        // update the relevant item which has been sent from the client
        players.map((item) => {
          if (item.id === data.id) {
            Object.assign(item, data);
          }
        });
  
        // broadcast this update to all clients
        const serverResponse: serverResponse = {
          responseType: "Data",
          data: players,
          spawns: spawns,
        };
  
        server.publish("all-clients", JSON.stringify(serverResponse));
        // ws.send(JSON.stringify(serverResponse));
      }

    },

    close(ws) {
      console.log(
        `Connection with ${ws.data.id}, PlayerName: ${ws.data.playerName} Closed!`
      );
      // brodcast that the player has left
      const removedResponse: serverResponse = {
        responseType: "Removed",
        data: ws.data.id,
      };
      server.publish("all-clients", JSON.stringify(removedResponse));

      // If the connection test player left, just ignore it
      if (ws.data.playerName === "Connection") {
        lastRemoved = lastRemoved;
        return;
      } else if (players.length - 1 === 0) {
        // otherwise if we have no players left set the index to 0 / origin
        lastRemoved = 0;
      } else {
        // otherwise find the spawnIndex of the player that just left
        lastRemoved =
          players.find((item) => item.id === ws.data.id)?.spawnIndex ?? 0;
      }
      // remove the spawn and player that just left from the arrays
      players = players.filter((item) => item.id !== ws.data.id);
      spawns = spawns.toSpliced(lastRemoved, 1);
    },
  },
});

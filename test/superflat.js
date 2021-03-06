var assert = require("assert");
var Vec3 = require('vec3').Vec3;
var mineflayer = require('../');

if(process.argv.length<3 || process.argv.length>5)
{
  console.log("Usage : node superflat.js <host> <port> [<name>] [<password>]");
  process.exit(1);
}

var Item = mineflayer.Item;
var Block = mineflayer.Block;
var blocksByName = mineflayer.ItemIndex.blocksByName;
var itemsByName = mineflayer.ItemIndex.itemsByName;

var bot = mineflayer.createBot({
    username: process.argv[4] ? process.argv[4] : "bot",
    viewDistance: "tiny",
    verbose: true,
    port:parseInt(process.argv[3]),
    host:process.argv[2],
    password:process.argv[5]
});

bot.on('login', function() {
  console.log("waiting a second...");
  // this wait is to get all the window updates out of the way before we start expecting exactly what we cause.
  // there are probably other updates coming in that we want to get out of the way too, like health updates.
  setTimeout(startTesting, 1000);
});

function clearInventory(cb) {
  for (var i = 0; i < bot.inventory.slots.length; i++) {
    if (bot.inventory.slots[i] == null) continue;
    setInventorySlot(i, null, function() {
      // start over until we have nothing to do
      clearInventory(cb);
    });
    return;
  }
  // done
  cb();
}

// you need to be in creative mode for this to work
function setInventorySlot(targetSlot, item, cb) {
  if (Item.equal(bot.inventory.slots[targetSlot], item)) {
    // already good to go
    return setImmediate(cb);
  }
  bot.creative.setInventorySlot(targetSlot, item);
  bot.inventory.once("windowUpdate", function(slot, oldItem, newItem) {
    assert(slot === targetSlot);
    assert(Item.equal(item, newItem));
    setImmediate(cb);
  });
}

var dirtCollectTest = [
  resetState,
  function(cb) {
    console.log("starting dirt collect test");
    setInventorySlot(36, new Item(blocksByName.dirt.id, 1, 0), cb);
  },
  function(cb) {
    fly(new Vec3(0, 2, 0), cb);
  },
  function(cb) {
    placeBlock(36, bot.entity.position.plus(new Vec3(0, -2, 0)), cb);
  },
  clearInventory,
  function(cb) {
    bot.creative.stopFlying();
    waitForFall(cb);
  },
  becomeSurvival,
  function(cb) {
    // we are bare handed
    bot.dig(bot.blockAt(bot.entity.position.plus(new Vec3(0, -1, 0))), cb);
  },
  function(cb) {
    // make sure we collected das dirt
    setTimeout(function() {
      assert(Item.equal(bot.inventory.slots[36], new Item(blocksByName.dirt.id, 1, 0)));
      sayEverywhere("dirt collect test: pass");
      cb();
    }, 1000);
  },
];
var chestManagementTest = (function() {
  var smallChestLocation = new Vec3(0, 4, -1);
  var largeChestLocations = [new Vec3(0, 4, 1), new Vec3(1, 4, 1)];
  var smallTrappedChestLocation = new Vec3(1, 4, 0);
  var largeTrappedChestLocations = [new Vec3(-1, 4, 1), new Vec3(-1, 4, 0)];
  var chestSlot = 36;
  var trappedChestSlot = 37;
  var boneSlot = 38;
  return [
    resetState,
    function(cb) {
      console.log("starting chest management test");
      setInventorySlot(chestSlot, new Item(blocksByName.chest.id, 3, 0), function() {
        setInventorySlot(trappedChestSlot, new Item(blocksByName.trappedChest.id, 3, 0), function() {
          setInventorySlot(boneSlot, new Item(itemsByName.bone.id, 3, 0), cb);
        });
      });
    },
    becomeSurvival,
    function(cb) {
      // place the chests around us
      placeBlock(chestSlot, largeChestLocations[0], function() {
        placeBlock(chestSlot, largeChestLocations[1], function() {
          placeBlock(chestSlot, smallChestLocation, function() {
            placeBlock(trappedChestSlot, largeTrappedChestLocations[0], function() {
              placeBlock(trappedChestSlot, largeTrappedChestLocations[1], function() {
                placeBlock(trappedChestSlot, smallTrappedChestLocation, function() {
                  cb();
                });
              });
            });
          });
        });
      });
    },
    function(cb) { depositBones(smallChestLocation, 1, cb); },
    function(cb) { depositBones(largeChestLocations[0], 2, cb); },
    function(cb) {
      checkSlotsAreEmpty(bot.inventory);
      cb();
    },
    function(cb) { withdrawBones(smallChestLocation, 1, cb); },
    function(cb) { withdrawBones(largeChestLocations[0], 2, cb); },
    function(cb) { depositBones(smallTrappedChestLocation, 1, cb); },
    function(cb) { depositBones(largeTrappedChestLocations[0], 2, cb); },
    function(cb) {
      checkSlotsAreEmpty(bot.inventory);
      cb();
    },
    function(cb) { withdrawBones(smallTrappedChestLocation, 1, cb); },
    function(cb) { withdrawBones(largeTrappedChestLocations[0], 2, cb); },
    function(cb) {
      sayEverywhere("chest management test: pass");
      cb();
    },
  ];

  function depositBones(chestLocation, count, cb) {
    var chest = bot.openChest(bot.blockAt(chestLocation));
    chest.on("open", function() {
      checkSlotsAreEmpty(chest.window);
      chest.deposit(itemsByName.bone.id, 0, count, function() {
        chest.close();
        cb();
      });
    });
  }
  function withdrawBones(chestLocation, count, cb) {
    var chest = bot.openChest(bot.blockAt(chestLocation));
    chest.on("open", function() {
      chest.withdraw(itemsByName.bone.id, 0, count, function() {
        checkSlotsAreEmpty(chest.window);
        chest.close();
        cb();
      });
    });
  }
  function checkSlotsAreEmpty(window) {
    for (var i = 0; i < window.inventorySlotStart; i++) {
      assert(window.slots[i] == null);
    }
  }
})();

function startTesting() {
  callbackChain(dirtCollectTest, function() {
    callbackChain(chestManagementTest, function() {
      console.log("done");
    });
  });
}

// always leaves you in creative mode
function resetState(cb) {
  callbackChain([
    becomeCreative,
    clearInventory,
    function(cb) {
      bot.creative.startFlying();
      teleport(new Vec3(0, 4, 0), cb);
    },
    waitForChunksToLoad,
    resetBlocksToSuperflat,
    clearInventory,
  ], cb);
}

function becomeCreative(cb) { setCreativeMode(true, cb); }
function becomeSurvival(cb) { setCreativeMode(false, cb); }
function setCreativeMode(value, cb) {
  // this function behaves the same whether we start in creative mode or not.
  // also, creative mode is always allowed for ops, even if server.properties says force-gamemode=true in survival mode.
  bot.chat("/gamemode " + (value ? "creative" : "survival"));
  bot.on("message", function onMessage(jsonMsg) {
    switch (jsonMsg.translate) {
      case "gameMode.changed":
        // good.
        bot.removeListener("message", onMessage);
        return cb();
      case "commands.generic.permission":
        sayEverywhere("ERROR: I need to be an op (allow cheats).");
        bot.removeListener("message", onMessage);
        // at this point we just wait forever.
        // the intention is that someone ops us while we're sitting here, then you kill and restart the test.
        return;
    }
    console.log("I didn't expect this message:", jsonMsg);
  });
}

function fly(delta, cb) {
  bot.creative.flyTo(bot.entity.position.plus(delta), cb);
}
function placeBlock(slot, position, cb) {
  bot.setQuickBarSlot(slot - 36);
  // always place the block on the top of the block below it, i guess.
  var referenceBlock = bot.blockAt(position.plus(new Vec3(0, -1, 0)));
  bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
  setImmediate(cb);
}
function teleport(position, cb) {
  bot.chat("/tp " + bot.username + " " + position.x + " " + position.y + " " + position.z);
  bot.on("move", function onMove() {
    if (bot.entity.position.distanceTo(position) < 0.9) {
      // close enough
      bot.removeListener("move", onMove);
      cb();
    }
  });
}

function sayEverywhere(message) {
  bot.chat(message);
  console.log(message);
}

var deltas3x3 = [
  new Vec3(-1, 0, -1),
  new Vec3( 0, 0, -1),
  new Vec3( 1, 0, -1),
  new Vec3(-1, 0,  0),
  new Vec3( 0, 0,  0),
  new Vec3( 1, 0,  0),
  new Vec3(-1, 0,  1),
  new Vec3( 0, 0,  1),
  new Vec3( 1, 0,  1),
];

function waitForChunksToLoad(cb) {
  var isLoaded = true;
  // check 3x3 chunks around us
  for (var i = 0; i < deltas3x3.length; i++) {
    if (bot.blockAt(bot.entity.position.plus(deltas3x3[i].scaled(64))) == null) {
      // keep wait
      return setTimeout(function() {
        waitForChunksToLoad(cb);
      }, 100);
    }
  }
  cb();
}
function waitForFall(cb) {
  assert(!bot.entity.onGround, "waitForFall called when we were already on the ground");
  var startingPosition = bot.entity.position.clone();
  bot.on("move", function onMove() {
    if (bot.entity.onGround) {
      var distance = startingPosition.distanceTo(bot.entity.position);
      assert(distance > 0.2, "waitForFall didn't fall very far: " + distance);
      bot.removeListener("move", onMove);
      cb();
    }
  });
}

var superflatLayers = [
  new Block(blocksByName.bedrock.id),
  new Block(blocksByName.dirt.id),
  new Block(blocksByName.dirt.id),
  new Block(blocksByName.grass.id),
  // and then air
];
function resetBlocksToSuperflat(cb) {
  var groundY = 4;
  for (var y = groundY + 4; y >= groundY - 1; y--) {
    var expectedBlock = superflatLayers[y];
    for (var i = 0; i < deltas3x3.length; i++) {
      var position = bot.entity.position.plus(deltas3x3[i]);
      position.y = y;
      var block = bot.blockAt(position);
      if (expectedBlock == null) {
        if (block.name === "air") continue;
        // dig it
        return digAndResume(position);
      } else {
        if (expectedBlock.type === block.type) continue;
        // fix it
        if (block.type !== 0) {
          // dig it
          return digAndResume(position);
        }
        // place it
        return placeAndResume(position, expectedBlock);
      }
    }
  }
  // all good
  cb();

  function digAndResume(position) {
    bot.dig(bot.blockAt(position), resume);
  }
  function placeAndResume(position, block) {
    setInventorySlot(36, new Item(block.type, 1, 0), function() {
      placeBlock(36, position);
      resume();
    });
  }
  function resume() {
    resetBlocksToSuperflat(cb);
  }
}

function callbackChain(functions, cb) {
  var i = 0;
  callNext();
  function callNext() {
    if (i < functions.length) {
      functions[i++](callNext);
    } else {
      cb();
    }
  }
}

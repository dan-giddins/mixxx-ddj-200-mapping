var DDJ200 = {
  headMix_switch : 0,
  fourDeckMode : false,
  vDeckNo : [0, 1, 2],
  vDeck1 : { sync_enabled : false, volMSB : 0, rateMSB : 0,
             jog_disabled: false, cue_pressed : false, cue_released : true },
  shiftPressed : { left : false, right : false },
  jogCounter : 0
};

DDJ200.init = function() {
    // creating associative arrays for the virtual decks
    this.vDeck = { 1: this.vDeck1, 2: _.clone(this.vDeck1),
                   3: _.clone(this.vDeck1), 4: _.clone(this.vDeck1)};

    for (var i = 1; i <= 4; i++) {
        var vgroup = "[Channel" + i + "]";
        // run onTrackLoad after every track load to e.g. set LEDs accordingly
        engine.connectControl(vgroup, "track_loaded", "DDJ200.onTrackLoad");
        // set Pioneer CDJ cue mode for all decks
        // engine.setValue(vgroup, "cue_cdj", true);
    }

    DDJ200.LEDs_off();

    // start with focus on library for selecting tracks (delay seems required)
    engine.beginTimer(500, "engine.setValue(\"[Library]\", " +
                      "\"MoveFocus\", 1);", true);
};

DDJ200.shutdown = function() { DDJ200.LEDs_off(); };

DDJ200.LEDs_off = function() {                       // trun off LEDs:

    for (var i = 0; i <= 1; i++) {
        midi.sendShortMsg(0x90 + i, 0x0B, 0x00);      // play button
        midi.sendShortMsg(0x90 + i, 0x0C, 0x00);      // play button
        midi.sendShortMsg(0x90 + i, 0x58, 0x00);      // beat sync button
        midi.sendShortMsg(0x90 + i, 0x54, 0x00);      // pfl headphone button
        for (var j = 0; j <= 8; j++) {
            midi.sendShortMsg(0x97 + 2 * i, j, 0x00); // hotcue buttons
        }
    }
};

DDJ200.onTrackLoad = function(channel, vgroup) {
    // set LEDs (hotcues, etc.) for the loaded deck
    // if controller is switched to this deck
    var vDeckNo = script.deckFromGroup(vgroup);
    var deckNo = 2; if (vDeckNo % 2) deckNo = 1;
    if (vDeckNo == DDJ200.vDeckNo[deckNo]) { DDJ200.switch_LEDs(vDeckNo); }
};

DDJ200.LoadSelectedTrack = function(channel, control, value, status, group) {
    if (! value ) { return; }
    print(channel);
    var deckNo = script.deckFromGroup(group);
    var vDeckNo = DDJ200.vDeckNo[deckNo];
    var vgroup = "[Channel" + vDeckNo +"]";
    engine.setValue(vgroup, "LoadSelectedTrack", true);
};

DDJ200.browseTracks = function(value) {
    DDJ200.jogCounter += value-64;
    if (DDJ200.jogCounter > 9) {
        engine.setValue("[Library]", "MoveDown", true);
        DDJ200.jogCounter = 0;
    } else if (DDJ200.jogCounter < -9) {
        engine.setValue("[Library]", "MoveUp", true);
        DDJ200.jogCounter = 0;
    }
};

DDJ200.shiftLeft = function() {
    // toggle shift left pressed variable
    DDJ200.shiftPressed["left"] = ! DDJ200.shiftPressed["left"];
};

DDJ200.shiftRight = function() {
    // toggle shift right pressed variable
    DDJ200.shiftPressed["right"] = ! DDJ200.shiftPressed["right"];
};

DDJ200.jog = function(channel, control, value, status, group) {
    // For a control that centers on 0x40 (64):
    // Convert value down to +1/-1
    // Register the movement
    if (DDJ200.shiftPressed["left"] == true) { DDJ200.browseTracks(value); }
    else {
          var vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
          if (DDJ200.vDeck[vDeckNo]["jog_disabled"]) { return; }
          var vgroup = "[Channel" + vDeckNo +"]";
          engine.setValue(vgroup, "jog", value - 64);
    }
};

DDJ200.scratch = function(channel, control, value, status, group) {
    // For a control that centers on 0x40 (64):
    // Convert value down to +1/-1
    // Register the movement
    engine.scratchTick(DDJ200.vDeckNo[script.deckFromGroup(group)],
                       value - 64);
};

DDJ200.touch = function(channel, control, value, status, group) {
    var vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    if (value === 0) {
        // disable jog for 900 ms otherwise it can prevent track alignment
        DDJ200.vDeck[vDeckNo]["jog_disabled"] = true;
        engine.beginTimer(900, "DDJ200.vDeck[" + vDeckNo +
                          "][\"jog_disabled\"] = false;", true);
        // disable scratch
        engine.scratchDisable(vDeckNo);
    } else {
        // enable scratch
        var alpha = 1.0 / 8;
        engine.scratchEnable(vDeckNo, 128, 33 + 1 / 3, alpha, alpha / 32);
    }
};

DDJ200.seek = function(channel, control, value, status, group) {
    var oldPos = engine.getValue(group, "playposition");
    // Since ‘playposition’ is normalized to unity, we need to scale by
    // song duration in order for the jog wheel to cover the same amount
    // of time given a constant turning angle.
    var duration = engine.getValue(group, "duration");
    var newPos = Math.max(0, oldPos + ((value - 64) * 0.2 / duration));

    var deckNo = script.deckFromGroup(group);
    var vgroup = "[Channel" + DDJ200.vDeckNo[deckNo] +"]";
    engine.setValue(vgroup, "playposition", newPos); // Strip search
};

DDJ200.headmix = function(channel, control, value) {
    // toggle headMix knob between -1 to 1
    if (! value ) { return; }  // do not execute if button is released
    DDJ200.headMix_switch = 1 - DDJ200.headMix_switch;
    engine.setValue("[Master]", "headMix", 2 * DDJ200.headMix_switch - 1);
    midi.sendShortMsg(0x96, 0x63, 0x7F * DDJ200.headMix_switch); //headMix LED
};

DDJ200.toggle_fourDeckMode = function(channel, control, value) {
    if (! value ) { return; }  // do not execute if button is released
    DDJ200.fourDeckMode = ! DDJ200.fourDeckMode;
    if (DDJ200.fourDeckMode) {
        midi.sendShortMsg(0x90, 0x54, 0x00);
        midi.sendShortMsg(0x91, 0x54, 0x00);
    } else {
        DDJ200.vDeckNo[1] = 1;
        DDJ200.vDeckNo[2] = 2;
        DDJ200.switch_LEDs(1); // set LEDs of controller deck
        DDJ200.switch_LEDs(2); // set LEDs of controller deck
    }
};

DDJ200.play = function(channel, control, value, status, group) {
    if (! value ) { return; }  // do not execute if button is released
    var vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    if (DDJ200.vDeck[vDeckNo]["cue_pressed"] == true) {
        // continue playing if cue butten is released
        DDJ200.vDeck[vDeckNo]["cue_release"] = true;
        return;
    }
    var vgroup = "[Channel" + vDeckNo +"]";
    var playing = engine.getValue(vgroup, "play");
    engine.setValue(vgroup, "play", ! playing);
    if (engine.getValue(vgroup, "play") == playing)
        engine.setValue(vgroup, "play", ! playing);
    midi.sendShortMsg(status, 0x0B, 0x7F * engine.getValue(vgroup, "play"));
};

DDJ200.sync_enabled = function(channel, control, value, status, group) {
    if (! value ) { return; }  // do not execute if button is released
    var vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    var vgroup = "[Channel" + vDeckNo +"]";
    var sync_enabled = ! engine.getValue(vgroup, "sync_enabled");
    DDJ200.vDeck[vDeckNo]["sync_enabled"] = sync_enabled;
    engine.setValue(vgroup, "sync_enabled", sync_enabled);
    midi.sendShortMsg(status, control, 0x7F * sync_enabled); // beat sync LED
};

DDJ200.rateMSB = function(channel, control, value, status, group) {
    // store most significant byte value of rate
    vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    DDJ200.vDeck[vDeckNo]["rateMSB"] = value;
};

DDJ200.rateLSB = function(channel, control, value, status, group) {
    var vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    var vgroup = "[Channel" + vDeckNo +"]";
    // calculte rate value from its most and least significant bytes
    var rateMSB = DDJ200.vDeck[vDeckNo]["rateMSB"];
    var rate = 1 - (((rateMSB << 7) + value) / 0x1FFF);
    engine.setValue(vgroup, "rate", rate);
};

DDJ200.volumeMSB = function(channel, control, value, status, group) {
    // store most significant byte value of volume
    vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    DDJ200.vDeck[vDeckNo]["volMSB"] = value;
};

DDJ200.volumeLSB = function(channel, control, value, status, group) {
    var vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    var vgroup = "[Channel" + vDeckNo +"]";
    // calculte volume value from its most and least significant bytes
    var volMSB = DDJ200.vDeck[vDeckNo]["volMSB"];
    var vol = ((volMSB << 7) + value) / 0x3FFF;
    //var vol = ((volMSB << 7) + value); // use for linear correction
    //vol = script.absoluteNonLin(vol, 0, 0.25, 1, 0, 0x3FFF);
    engine.setValue(vgroup, "volume", vol);
};

DDJ200.eq = function(channel, control, value, status, group) {
    var val = script.absoluteNonLin(value, 0, 1, 4);
    var eq = 1; if (control == 0x0B) eq = 2;
    else if (control == 0x07) eq = 3;
    var deckNo = group.substring(24, 25);
    // var deckNo = group.match("hannel.")[0].substring(6); // more general
    // var deckNo = script.deckFromGroup(group); // working after fix
    // https://github.com/mixxxdj/mixxx/pull/3178 only
    var vDeckNo = DDJ200.vDeckNo[deckNo];
    var vgroup = group.replace("Channel" + deckNo, "Channel" + vDeckNo);
    engine.setValue(vgroup, "parameter" + eq, val);
};

DDJ200.super1 = function(channel, control, value, status, group) {
    var val = script.absoluteNonLin(value, 0, 0.5, 1);
    var deckNo = group.substring(26, 27);
    //var deckNo = group.match("hannel.")[0].substring(6); // more general
    //var deckNo = script.deckFromGroup(group); // working after fix
    // https://github.com/mixxxdj/mixxx/pull/3178 only
    var vDeckNo = DDJ200.vDeckNo[deckNo];
    var vgroup = group.replace("Channel" + deckNo, "Channel" + vDeckNo);
    engine.setValue(vgroup, "super1", val);
};

DDJ200.cue_default = function(channel, control, value, status, group) {
    var vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    if (DDJ200.vDeck[vDeckNo]["cue_release"] == true) {
        // continue playing if cue is released and play was pressed
        DDJ200.vDeck[vDeckNo]["cue_release"] = false;
        DDJ200.vDeck[vDeckNo]["cue_pressed"] = 1 - DDJ200.vDeck[vDeckNo
                                                          ]["cue_pressed"];
        return;
    }
    DDJ200.vDeck[vDeckNo]["cue_pressed"] = 1 - DDJ200.vDeck[vDeckNo
                                                            ]["cue_pressed"];
    var vgroup = "[Channel" + vDeckNo +"]";
    engine.setValue(vgroup, "cue_default", true);
    var deckNo = script.deckFromGroup(group);
    midi.sendShortMsg(0x90 + deckNo - 1, 0x0C, 0x7F *    // set cue LED
                      (engine.getValue(vgroup, "cue_point") != -1));
    // set play LED
    midi.sendShortMsg(status, 0x0B, 0x7F * engine.getValue(vgroup, "play"));
};

DDJ200.cue_gotoandstop = function(channel, control, value, status, group) {
    var vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    var vgroup = "[Channel" + vDeckNo +"]";
    engine.setValue(vgroup, "cue_gotoandstop", true);
    //engine.setValue(vgroup, "start_stop", true); // go to start if prefered
    midi.sendShortMsg(status, 0x0B, 0x7F * engine.getValue(vgroup, "play"));
};

DDJ200.hotcue_N_activate = function(channel, control, value, status, group) {
    var vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    var vgroup = "[Channel" + vDeckNo +"]";
    var hotcue = "hotcue_" + (control + 1);
    engine.setValue(vgroup, hotcue + "_activate", true);
    midi.sendShortMsg(status, control,
                      0x7F * engine.getValue(vgroup, hotcue + "_enabled"));
    var deckNo = script.deckFromGroup(group);
    midi.sendShortMsg(0x90 + deckNo - 1, 0x0B, 0x7F *
                      engine.getValue(vgroup, "play")); // set play LED
};

DDJ200.hotcue_N_clear = function(channel, control, value, status, group) {
    var vDeckNo = DDJ200.vDeckNo[script.deckFromGroup(group)];
    var vgroup = "[Channel" + vDeckNo +"]";
    engine.setValue(vgroup, "hotcue_" + (control + 1) + "_clear", true);
    midi.sendShortMsg(status-1, control, 0x00);        // set hotcue LEDs
};

DDJ200.pfl = function(channel, control, value, status, group) {
    if (! value ) { return; }  // do not execute if button is released
    var deckNo = script.deckFromGroup(group);
    var vDeckNo = DDJ200.vDeckNo[deckNo];
    var vgroup = "[Channel" + vDeckNo +"]";
    var pfl = ! engine.getValue(vgroup, "pfl");
    engine.setValue(vgroup, "pfl", pfl);
    if (DDJ200.fourDeckMode == false) {
        midi.sendShortMsg(status, 0x54, 0x7F * pfl);  // switch pfl LED
    }
};

DDJ200.switch_LEDs = function(vDeckNo) {
    // set LEDs of controller deck according to virtual deck
    var c = 1; if (vDeckNo % 2) c = 0;
    vgroup = "[Channel" + vDeckNo +"]";
    midi.sendShortMsg(0x90 + c, 0x0B, 0x7F * engine.getValue(vgroup, "play"));
    midi.sendShortMsg(0x90 + c, 0x0C, 0x7F *
                      (engine.getValue(vgroup, "cue_point") != -1));
    midi.sendShortMsg(0x90 + c, 0x58, 0x7F * engine.getValue(vgroup,
                                                             "sync_enabled"));
    if (DDJ200.fourDeckMode == false) {
        midi.sendShortMsg(0x90 + c, 0x54,
                          0x7F * engine.getValue(vgroup, "pfl"));
    }

    if (vDeckNo % 2) c = 7; else c = 9;
    for (var i = 1; i <= 8; i++) {
        midi.sendShortMsg(0x90 + c, i - 1, 0x7F * engine.getValue(
                          vgroup, "hotcue_" + i + "_enabled"));
    }
};

DDJ200.deck_toggle = function(channel, control, value, status, group) {
    if (! value ) { return; }  // do not execute if button is released
    if (DDJ200.shiftPressed["left"] == true) {
        // left shift + pfl 1/2 does not toggle decks but loads track
        DDJ200.LoadSelectedTrack(channel, control, value, status, group);
    } else if (DDJ200.fourDeckMode == true) { // right shift + pfl 1/2 toggles
            var deckNo = script.deckFromGroup(group);
            var vDeckNo = 0;
            var LED = 0x7F;
            if (deckNo == 1) {
                // toggle virtual deck of controller deck 1
                DDJ200.vDeckNo[1] = 4 - DDJ200.vDeckNo[1];
                if (DDJ200.vDeckNo[1] == 1) LED = 0;
                vDeckNo = DDJ200.vDeckNo[1];
            }
            else { // deckNo == 2
                // toggle virtual deck of controller deck 2
                DDJ200.vDeckNo[2] = 6 - DDJ200.vDeckNo[2];
                if (DDJ200.vDeckNo[2] == 2) LED = 0;
                vDeckNo = DDJ200.vDeckNo[2];
            }

            midi.sendShortMsg(status, 0x54, LED); // toggle virtual deck LED
            DDJ200.switch_LEDs(vDeckNo); // set LEDs of controller deck
    }
};

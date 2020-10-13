var DDJ200 = {
 headMix_switch : 0,
 vDeck : new Array(1, 2),
 jog_disabled : new Array (false, false, false, false)
};

DDJ200.init = function () {
    DDJ200.leftDeck = new DDJ200.Deck([1, 3], 1);
    DDJ200.rightDeck = new DDJ200.Deck([2, 4], 2);
    };

DDJ200.shutdown = function () {};

DDJ200.scratch = function (channel, control, value, status, group) {
    // For a control that centers on 0x40 (64):
    // Convert value down to +1/-1
    // Register the movement
    engine.scratchTick(script.deckFromGroup(group), value - 64);
};

DDJ200.jog = function (channel, control, value, status, group) {
    // For a control that centers on 0x40 (64):
    // Convert value down to +1/-1
    // Register the movement
    var deckNumber = script.deckFromGroup(group);
    if (DDJ200.jog_disabled[deckNumber-1]) { return; }
    engine.setValue(group, 'jog', value - 64);
};


DDJ200.touch = function (channel, control, value, status, group) {
    var deckNumber = script.deckFromGroup(group);
    if (value === 0) {
        // disable scratch
        if(engine.getValue(group, "sync_enabled") == true) {
            // disable jog to not prevent alignment
            DDJ200.jog_disabled[deckNumber-1] = true;
            // and enable it after 900 ms again
            engine.beginTimer(900, "DDJ200.jog_disabled[" +
                              (deckNumber-1) + "] = false;", true);
        }
        engine.scratchDisable(deckNumber);
    } else {
        // enable scratch
        var alpha = 1.0 / 8;
        engine.scratchEnable(deckNumber, 128, 33 + 1 / 3, alpha, alpha / 32);
    }
};

DDJ200.seek = function (channel, control, value, status, group) {
    var oldPos = engine.getValue(group, "playposition");
    // Since ‘playposition’ is normalized to unity, we need to scale by
    // song duration in order for the jog wheel to cover the same amount
    // of time given a constant turning angle.
    var duration = engine.getValue(group, "duration");
    var newPos = Math.max(0, oldPos + ((value - 64) * 0.2 / duration));
    engine.setValue(group, "playposition", newPos); // Strip search
};

DDJ200.headmix = function (channel, control, value, status, group) {
    if (value === 0) { return; }
    DDJ200.headMix_switch = 1 - DDJ200.headMix_switch;
    engine.setValue("[Master]", "headMix", 2 * DDJ200.headMix_switch - 1);
    // headMix knob has values from -1 to 1

    midi.sendShortMsg(0x90+channel, control, 0x7F * DDJ200.headMix_switch);
    //midi.sendShortMsg(0x96, 0x63, 0x7F);  // headMix switch
};

DDJ200.play = function (channel, control, value, status, group) {
     if (value === 0) { return; }
    deckNumber = script.deckFromGroup(group);
    if (deckNumber == 1) { vgroup = "[Channel" + DDJ200.vDeck[(deckNumber-1)] +"]"; }
    else { vgroup = "[Channel" + DDJ200.vDeck[(deckNumber-1)] +"]"; }

    //print(channel);
    //print(0x90+channel);
    //v = 0x90+channel;
    engine.setValue(vgroup, "play", ! (engine.getValue(vgroup, "play")));
    //midi.sendShortMsg(v, control, 0x7F * engine.getValue(vgroup, "play"));
};

DDJ200.Deck = function (deckNumbers, midiChannel)
    { components.Deck.call(this, deckNumbers);
      this.volume = new components.Pot({
          midi: [0xB0 + midiChannel, 0x33],
                  inKey: 'volume',
                  });      
    };

//DDJ200.volume = function (channel, control, value, status, group) {
//    if (value === 0) { return; }
//    deckNumber = script.deckFromGroup(group);
    //var v = engine.getParameter("[Channel1]", "volume");
    //engine.setValue(group, "volume", value / 0x3FFF);
//    var v = (value << 7) / 0x3FFF;
//    print(value << 7);
    //    print(script.absoluteLin(value,0,1,0,127));
//};
    
DDJ200.initLEDs = function (channel, control, value, status, group) {
    midi.sendShortMsg(0x90+channel, 0x0B,
                      0x7F * engine.getValue(group, "play"));
};

DDJ200.deck_toggle = function (channel, control, value, status, group) {
    if (value === 0) { return; }
    deckNumber = script.deckFromGroup(group);

    LED = 0x7F;
    if (deckNumber == 1) {
        DDJ200.vDeck[0] = 4 - DDJ200.vDeck[0];
        if (DDJ200.vDeck[0] == 1) LED = 0;
        vgroup = "[Channel" + DDJ200.vDeck[0] +"]";
    }
    else { // deckNumber == 2
        DDJ200.vDeck[1] = 6 - DDJ200.vDeck[1];
        if (DDJ200.vDeck[1] == 2) LED = 0;
        vgroup = "[Channel" + DDJ200.vDeck[1] +"]";
    }
    
    //print(channel-7);
    //print(control);
    //print(status);
    midi.sendShortMsg(status, 0x07, LED); // toggle virtual deck LED
    //midi.sendShortMsg(0x90+channel, 0x07, 0x7F);
    DDJ200.initLEDs(deckNumber-1, control, value, status, vgroup);
};

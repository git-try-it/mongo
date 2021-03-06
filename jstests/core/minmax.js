// Test min / max query parameters.
// @tags: [assumes_balancer_off]
(function() {
    "use strict";

    load("jstests/libs/fixture_helpers.js");      // For FixtureHelpers.
    load("jstests/aggregation/extras/utils.js");  // For resultsEq.

    const coll = db.jstests_minmax;
    coll.drop();

    function addData() {
        assert.commandWorked(coll.save({a: 1, b: 1}));
        assert.commandWorked(coll.save({a: 1, b: 2}));
        assert.commandWorked(coll.save({a: 2, b: 1}));
        assert.commandWorked(coll.save({a: 2, b: 2}));
    }

    assert.commandWorked(coll.ensureIndex({a: 1, b: 1}));
    addData();

    assert.eq(1, coll.find().min({a: 1, b: 2}).max({a: 2, b: 1}).toArray().length);
    assert.eq(2, coll.find().min({a: 1, b: 2}).max({a: 2, b: 1.5}).toArray().length);
    assert.eq(2, coll.find().min({a: 1, b: 2}).max({a: 2, b: 2}).toArray().length);

    // Single bound.
    assert.eq(3, coll.find().min({a: 1, b: 2}).toArray().length);
    assert.eq(3, coll.find().max({a: 2, b: 1.5}).toArray().length);
    assert.eq(3, coll.find().min({a: 1, b: 2}).hint({a: 1, b: 1}).toArray().length);
    assert.eq(3, coll.find().max({a: 2, b: 1.5}).hint({a: 1, b: 1}).toArray().length);

    coll.drop();
    assert.commandWorked(coll.ensureIndex({a: 1, b: -1}));
    addData();
    assert.eq(4, coll.find().min({a: 1, b: 2}).toArray().length);
    assert.eq(4, coll.find().max({a: 2, b: 0.5}).toArray().length);
    assert.eq(1, coll.find().min({a: 2, b: 1}).toArray().length);
    assert.eq(1, coll.find().max({a: 1, b: 1.5}).toArray().length);
    assert.eq(4, coll.find().min({a: 1, b: 2}).hint({a: 1, b: -1}).toArray().length);
    assert.eq(4, coll.find().max({a: 2, b: 0.5}).hint({a: 1, b: -1}).toArray().length);
    assert.eq(1, coll.find().min({a: 2, b: 1}).hint({a: 1, b: -1}).toArray().length);
    assert.eq(1, coll.find().max({a: 1, b: 1.5}).hint({a: 1, b: -1}).toArray().length);

    // Hint doesn't match.
    assert.throws(function() {
        coll.find().min({a: 1}).hint({a: 1, b: -1}).toArray();
    });
    assert.throws(function() {
        coll.find().min({a: 1, b: 1}).max({a: 1}).hint({a: 1, b: -1}).toArray();
    });
    assert.throws(function() {
        coll.find().min({b: 1}).max({a: 1, b: 2}).hint({a: 1, b: -1}).toArray();
    });
    assert.throws(function() {
        coll.find().min({a: 1}).hint({$natural: 1}).toArray();
    });
    assert.throws(function() {
        coll.find().max({a: 1}).hint({$natural: 1}).toArray();
    });

    coll.drop();
    assert.commandWorked(coll.ensureIndex({a: 1}));
    for (let i = 0; i < 10; ++i) {
        assert.commandWorked(coll.save({_id: i, a: i}));
    }

    // Reverse direction scan of the a:1 index between a:6 (inclusive) and a:3 (exclusive) is
    // expected to fail, as max must be > min.
    let error = assert.throws(function() {
        coll.find().min({a: 6}).max({a: 3}).sort({a: -1}).toArray();
    });
    assert.eq(error.code, ErrorCodes.BadValue);

    error = assert.throws(function() {
        coll.find().min({a: 6}).max({a: 3}).sort({a: -1}).hint({a: 1}).toArray();
    });
    assert.eq(error.code, ErrorCodes.BadValue);

    // A find with identical min and max values is expected to fail, as max is exclusive.
    error = assert.throws(function() {
        coll.find().min({a: 2}).max({a: 2}).toArray();
    });
    assert.eq(error.code, ErrorCodes.BadValue);

    error = assert.throws(function() {
        coll.find().min({a: 2}).max({a: 2}).hint({a: 1}).toArray();
    });
    assert.eq(error.code, ErrorCodes.BadValue);

    error = assert.throws(function() {
        coll.find().min({a: 2}).max({a: 2}).sort({a: -1}).toArray();
    });
    assert.eq(error.code, ErrorCodes.BadValue);

    error = assert.throws(function() {
        coll.find().min({a: 2}).max({a: 2}).sort({a: -1}).hint({a: 1}).toArray();
    });
    assert.eq(error.code, ErrorCodes.BadValue);

    coll.drop();
    addData();
    assert.commandWorked(coll.ensureIndex({a: 1, b: 1}));

    error = assert.throws(function() {
        coll.find().min({a: 1, b: 2}).max({a: 1, b: 2}).toArray();
    });
    assert.eq(error.code, ErrorCodes.BadValue);

    error = assert.throws(function() {
        coll.find().min({a: 1, b: 2}).max({a: 1, b: 2}).hint({a: 1, b: 1}).toArray();
    });
    assert.eq(error.code, ErrorCodes.BadValue);

    // Test ascending index.
    coll.drop();
    assert.commandWorked(coll.ensureIndex({a: 1}));
    assert.commandWorked(coll.insert({a: 3}));
    assert.commandWorked(coll.insert({a: 4}));
    assert.commandWorked(coll.insert({a: 5}));

    let cursor = coll.find().min({a: 4});
    if (FixtureHelpers.numberOfShardsForCollection(coll) === 1) {
        assert.eq(4, cursor.next().a);
        assert.eq(5, cursor.next().a);
    } else {
        // With more than one shard, we cannot assume the results will come back in order, since we
        // did not request a sort.
        assert(resultsEq([cursor.next().a, cursor.next().a], [4, 5]));
    }
    assert(!cursor.hasNext());

    cursor = coll.find().max({a: 4});
    assert.eq(3, cursor.next()["a"]);
    assert(!cursor.hasNext());

    // Test descending index.
    assert.commandWorked(coll.dropIndexes());
    assert.commandWorked(coll.ensureIndex({a: -1}));

    cursor = coll.find().min({a: 4});
    if (FixtureHelpers.numberOfShardsForCollection(coll) === 1) {
        assert.eq(4, cursor.next().a);
        assert.eq(3, cursor.next().a);
    } else {
        // With more than one shard, we cannot assume the results will come back in order, since we
        // did not request a sort.
        assert(resultsEq([cursor.next().a, cursor.next().a], [4, 3]));
    }
    assert(!cursor.hasNext());

    cursor = coll.find().max({a: 4});
    assert.eq(5, cursor.next()["a"]);
    assert(!cursor.hasNext());
}());
var targetId = ObjectId("699ec4607360147a7c1fd1ab");
db.getMongo().getDBNames().forEach(function(dbName) {
  var d = db.getSiblingDB(dbName);
  d.getCollectionNames().forEach(function(collName) {
    try {
      if (d[collName].findOne({_id: targetId})) {
        print("Found in", dbName + "." + collName);
      }
    } catch(e) {}
  });
});

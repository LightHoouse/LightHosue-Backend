db = db.getSiblingDB("lighthouse");
db.createCollection("steps", { validator: { $jsonSchema: { bsonType:"object", required:["stepId","sessionId","seq"], properties:{ stepId:{bsonType:"string"}, sessionId:{bsonType:"string"}, seq:{bsonType:"int"} } } }, validationLevel:"moderate" });
db.createCollection("snapshots", { validator: { $jsonSchema: { bsonType:"object", required:["sessionId","studentId","privacy"], properties:{ sessionId:{bsonType:"string"}, studentId:{bsonType:"string"}, privacy:{bsonType:"object"} } } }, validationLevel:"moderate" });
db.createCollection("commands");
db.createCollection("acks");
db.steps.createIndex({sessionId:1, seq:1}, {unique:true});
db.steps.createIndex({"semantics.intent":"text"});
db.snapshots.createIndex({_storedAt:1}, {expireAfterSeconds:86400});
db.acks.createIndex({cmdId:1}, {unique:true, sparse:true});
print("Lighthouse MongoDB schema ready");


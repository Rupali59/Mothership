package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	defaultMongoURI = "mongodb://localhost:27017"
	dbName          = "motherboard_config"
	collName        = "entity_configurations"
	docID           = "master_config"
)

func main() {
	// Load .env file if exists
	_ = godotenv.Load()

	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		mongoURI = defaultMongoURI
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	fmt.Printf("Connecting to MongoDB at %s...\n", mongoURI)
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}
	defer client.Disconnect(ctx)

	// Read the JSON file
	cwd, _ := os.Getwd()
	jsonPath := filepath.Join(cwd, "seeds/data/global/entity_configs.json")
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		log.Fatalf("Failed to read JSON file at %s: %v", jsonPath, err)
	}

	var configs map[string]interface{}
	if err := json.Unmarshal(data, &configs); err != nil {
		log.Fatalf("Failed to parse JSON: %v", err)
	}

	coll := client.Database(dbName).Collection(collName)

	// Prepare document
	doc := bson.M{
		"_id":       docID,
		"entities":  configs,
		"updatedAt": time.Now(),
	}

	// Upsert
	opts := options.Replace().SetUpsert(true)
	_, err = coll.ReplaceOne(ctx, bson.M{"_id": docID}, doc, opts)
	if err != nil {
		log.Fatalf("Failed to upsert configurations: %v", err)
	}

	fmt.Println("✅ Successfully seeded entity configurations to MongoDB.")
}

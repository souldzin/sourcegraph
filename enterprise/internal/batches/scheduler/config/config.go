package config

import (
	"bytes"
	"encoding/json"
	"sync"

	"github.com/inconshreveable/log15"

	"github.com/sourcegraph/sourcegraph/enterprise/internal/batches/scheduler/window"
	"github.com/sourcegraph/sourcegraph/internal/conf"
	"github.com/sourcegraph/sourcegraph/schema"
)

// This is a singleton because, well, the entire site configuration system
// essentially is.
var (
	config *configuration
	mu     sync.Mutex
)

// Active returns the window configuration in effect at the present time. This
// is not a live object, and may become outdated if held for long periods.
func Active() *window.Configuration {
	return ensureConfig().Active()
}

// Subscribe returns a channel that will receive a message with the new
// configuration each time it is updated.
func Subscribe() chan *window.Configuration {
	return ensureConfig().Subscribe()
}

func ensureConfig() *configuration {
	mu.Lock()
	defer mu.Unlock()

	if config == nil {
		config = newConfiguration()
	}
	return config
}

type configuration struct {
	mu          sync.RWMutex
	active      *window.Configuration
	raw         *[]*schema.BatchChangeRolloutWindow
	subscribers []chan *window.Configuration
}

func newConfiguration() *configuration {
	c := &configuration{subscribers: []chan *window.Configuration{}}

	first := true
	conf.Watch(func() {
		c.mu.Lock()
		defer c.mu.Unlock()

		incoming := conf.Get().BatchChangesRolloutWindows

		// If this isn't the first time the watcher has been called and the raw
		// configuration hasn't changed, we don't need to do anything here.
		if !first && sameConfiguration(c.raw, incoming) {
			return
		}

		cfg, err := window.NewConfiguration(incoming)
		if err != nil {
			if c.active == nil {
				log15.Warn("invalid batch changes rollout configuration detected, using the default")
			} else {
				log15.Warn("invalid batch changes rollout configuration detected, using the previous configuration")
			}
			return
		}

		// Set up the current state.
		c.active = cfg
		c.raw = incoming
		first = false

		// Notify subscribers.
		c.notify()
	})

	return c
}

func (c *configuration) Active() *window.Configuration {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return c.active
}

func (c *configuration) Subscribe() chan *window.Configuration {
	c.mu.Lock()
	defer c.mu.Unlock()

	ch := make(chan *window.Configuration)
	config.subscribers = append(config.subscribers, ch)

	return ch
}

func (c *configuration) notify() {
	for _, subscriber := range c.subscribers {
		subscriber <- c.active
	}
}

func sameConfiguration(prev, next *[]*schema.BatchChangeRolloutWindow) bool {
	// We only want to update if the actual rollout window configuration
	// changed. This is an inefficient, but effective way of figuring that out;
	// since site configurations shouldn't be changing _that_ often, the cost is
	// acceptable here.
	oldJson, err := json.Marshal(prev)
	if err != nil {
		log15.Warn("unable to marshal old batch changes rollout configuration to JSON", "err", err)
	}

	newJson, err := json.Marshal(next)
	if err != nil {
		log15.Warn("unable to marshal new batch changes rollout configuration to JSON", "err", err)
	}

	return bytes.Equal(oldJson, newJson)
}

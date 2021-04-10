package scheduler

import (
	"context"
	"time"

	"github.com/inconshreveable/log15"

	"github.com/sourcegraph/sourcegraph/enterprise/internal/batches/store"
	"github.com/sourcegraph/sourcegraph/internal/batches"
	"github.com/sourcegraph/sourcegraph/internal/batches/scheduler/config"
	"github.com/sourcegraph/sourcegraph/internal/goroutine"
)

// Scheduler provides a scheduling service that moves changesets from the
// scheduled state to the queued state based on the current rate limit, if
// anything. Changesets are processed in a FIFO manner.
type Scheduler struct {
	ctx   context.Context
	done  chan struct{}
	store *store.Store
}

var _ goroutine.BackgroundRoutine = &Scheduler{}

func NewScheduler(ctx context.Context, bstore *store.Store) *Scheduler {
	return &Scheduler{
		ctx:   ctx,
		done:  make(chan struct{}),
		store: bstore,
	}
}

func (s *Scheduler) Start() {
	goroutine.Go(func() {
		log15.Debug("starting batch change scheduler")

		// Set up a global backoff strategy where we start at 5 seconds, up to a
		// minute, when we don't have any changesets to enqueue. Without this,
		// an unlimited schedule will essentially busy-wait calling Take().
		backoff := newBackoff(5*time.Second, 2, 1*time.Minute)

		// Set up our configuration listener.
		cfg := config.Subscribe()

		for {
			schedule := config.Active().Schedule()
			taker := newTaker(schedule)
			validity := time.NewTimer(time.Until(schedule.ValidUntil()))

			log15.Debug("applying batch change schedule", "schedule", schedule, "until", schedule.ValidUntil())

		scheduleloop:
			for {
				select {
				case delay := <-taker.C:
					// We can enqueue a changeset. Let's try to do so, ensuring
					// that we always return a duration back down the delay
					// channel.
					func() {
						d := time.Duration(0)
						defer func() { delay <- d }()

						if cs, err := s.store.GetNextScheduledChangeset(s.ctx); err == store.ErrNoResults {
							// There is no changeset to enqueue, so we'll increment
							// the backoff delay and return that.
							d = backoff.next()
						} else if err != nil {
							// To state the obvious, this shouldn't happen. It's
							// probably a database issue, so again, let's back
							// off.
							log15.Warn("error retrieving the next scheduled changeset", "err", err)
							d = backoff.next()
						} else {
							// We have a changeset to enqueue, so let's move it into
							// the right state, reset any backoff we might have
							// accrued along the way, and loop without any delay.
							cs.ReconcilerState = batches.ReconcilerStateQueued
							if err := s.store.UpsertChangeset(s.ctx, cs); err != nil {
								log15.Warn("error updating the next scheduled changeset", "err", err, "changeset", cs)
							}
							backoff.reset()
						}
					}()

				case <-validity.C:
					// The schedule is no longer valid, so let's break out of
					// this loop and build a new schedule.
					break scheduleloop

				case <-cfg:
					// The batch change rollout window configuration was
					// updated, so let's break out of this loop and build a new
					// schedule.
					break scheduleloop

				case <-s.done:
					// The scheduler service has been asked to stop, so let's
					// stop.
					log15.Debug("stopping the batch change scheduler")
					taker.stop()
					return
				}
			}

			taker.stop()
		}
	})
}

func (s *Scheduler) Stop() {
	s.done <- struct{}{}
	close(s.done)
}

// backoff implements a very simple bounded exponential backoff strategy.
type backoff struct {
	init       time.Duration
	multiplier int
	limit      time.Duration

	current time.Duration
}

func newBackoff(init time.Duration, multiplier int, limit time.Duration) *backoff {
	return &backoff{
		init:       init,
		multiplier: multiplier,
		limit:      limit,
		current:    init,
	}
}

func (b *backoff) next() time.Duration {
	curr := b.current

	b.current *= time.Duration(b.multiplier)
	if b.current > b.limit {
		b.current = b.limit
	}

	return curr
}

func (b *backoff) reset() {
	b.current = b.init
}

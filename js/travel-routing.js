// Travel routes are weighted by plotted map distance between connected systems.
export function buildLinkMap(data) {
  const linkMap = new Map(data.systems.map((system) => [system.name, []]));

  data.routes.forEach(([from, to]) => {
    if (linkMap.has(from)) linkMap.get(from).push(to);
    if (linkMap.has(to)) linkMap.get(to).push(from);
  });

  return linkMap;
}

export function distanceBetween(byName, fromName, toName) {
  const from = byName.get(fromName);
  const to = byName.get(toName);
  // Route weights use straight-line distance on the authored map coordinates.
  return Math.hypot(to.x - from.x, to.y - from.y);
}

// Dijkstra's algorithm chooses the shortest charted path by map distance.
export function findChartedRoute({ data, linkMap, byName, startName, endName }) {
  const distances = new Map(data.systems.map((system) => [system.name, Infinity]));
  const previous = new Map();
  const unvisited = new Set(distances.keys());
  distances.set(startName, 0);

  while (unvisited.size) {
    const current = [...unvisited].sort((a, b) => distances.get(a) - distances.get(b))[0];
    if (!current || distances.get(current) === Infinity) break;
    if (current === endName) break;

    unvisited.delete(current);
    linkMap.get(current).forEach((neighbor) => {
      if (!unvisited.has(neighbor)) return;
      const nextDistance = distances.get(current) + distanceBetween(byName, current, neighbor);
      if (nextDistance < distances.get(neighbor)) {
        distances.set(neighbor, nextDistance);
        previous.set(neighbor, current);
      }
    });
  }

  if (distances.get(endName) === Infinity) return null;

  const path = [];
  let current = endName;
  // Walk the predecessor chain backward, then reverse it into travel order.
  while (current) {
    path.unshift(current);
    if (current === startName) break;
    current = previous.get(current);
  }

  return path[0] === startName ? { path, distance: distances.get(endName) } : null;
}

// A travel leg prefers charted routes, then falls back to a direct uncharted jump.
export function buildTravelLeg({ data, linkMap, byName, startName, endName, mode }) {
  const route = findChartedRoute({ data, linkMap, byName, startName, endName });

  if (route && mode === "charted") {
    return {
      start: startName,
      end: endName,
      path: route.path,
      distance: route.distance,
      jumps: route.path.length - 1,
      charted: true,
      hasChartedRoute: true
    };
  }

  return {
    start: startName,
    end: endName,
    path: [startName, endName],
    distance: distanceBetween(byName, startName, endName),
    jumps: 1,
    charted: false,
    hasChartedRoute: Boolean(route)
  };
}

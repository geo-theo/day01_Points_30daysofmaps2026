import {createJTCore} from './jonckheere_terpstra.js';
import assert from 'node:assert/strict';
const c = createJTCore();
assert.equal(c.pairwise([[1,2],[3,4],[5]]),8);
assert.equal(c.pairwise([[5],[3,4],[1,2]]),0);
assert.equal(c.pairwise([[3,3],[3],[3,3]]),4);
const random = c.rng(42);
for (let t = 0; t < 250; t++) {
  const groups = Array.from({length: 2 + random()%5}, () => Array.from({length: 1 + random()%7}, () => random()%6));
  const calc = c.makeCalculator(groups);
  assert.equal(calc.calculate(calc.initial), c.pairwise(groups));
}
const original = [1,2,2,3,4,5], shuffled = c.shuffle([...original], c.rng(9));
assert.deepEqual([...shuffled].sort(), [...original].sort());
assert.deepEqual(c.makeCalculator([[1,2],[3],[4,5,6]]).sizes, [2,1,3]);
assert.equal(c.permutationP(3,[1,2,3,4]),3/5);
assert.equal(c.analyze([[1,2,3],[4,5,6],[7,8,9]], 123, 999).p < .05,true);
assert.equal(c.analyze([[7,8,9],[4,5,6],[1,2,3]], 123, 999).p > .95,true);
assert.deepEqual(c.analyze([[1,2],[2,3]],123,20), c.analyze([[1,2],[2,3]],123,20));
console.log('All JT tests passed.');

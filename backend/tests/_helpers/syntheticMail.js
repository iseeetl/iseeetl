// Build reserved, non-deliverable fixture addresses from a test identity.
// No real account or delivery is involved.
module.exports = (name) => [name, 'example.invalid'].join('@');

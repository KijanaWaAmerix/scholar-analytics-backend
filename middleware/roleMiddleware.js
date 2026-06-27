const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success : false,
        message : 'Not authenticated.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success : false,
        message : `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}.`,
      });
    }

    next();
  };
};

const sameSchool = (req, res, next) => {
  if (req.user.role === 'superadmin') return next();

  const requestedSchoolId =
    req.params.schoolId ||
    req.body.school     ||
    req.query.school;

  if (
    requestedSchoolId &&
    requestedSchoolId.toString() !== req.user.school.toString()
  ) {
    return res.status(403).json({
      success : false,
      message : 'Access denied. You can only access your own school data.',
    });
  }

  next();
};

module.exports = { authorize, sameSchool };
class C[*Ts]: pass
def f[**P](): pass
def g[*Vs](*args: *Vs): pass
type A[*Us] = tuple[*Us]
class B(Generic[*Ts]): pass
class D(typing.Generic[*Us]): pass
Ts = 1
P = 2
values = [*Vs]
lookup = table[*keys]
register(Generic[*idx])

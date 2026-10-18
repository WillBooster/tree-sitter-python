class C[T: list[dict[str, int]] = list[dict[str, int]]]: pass
def f[*Ts = *tuple[int, str], **P = [str]](): pass
type A[T: (int, str) = list[int]] = T
class D[T: list[int] | None = list[str] | None]: pass
class E[T: int | str = typing.List[int]]: pass
class F[T = typing.Dict[str, typing.List[int | str]]]: pass
class G[T = (list[int] | None), **P = [typing.List[str] | None]]: pass
class H[T = int | str | None, *Ts = *typing.Tuple[int, str]]: pass
class I[*Ts = *(typing.Tuple[int] | tuple[str])]: pass
class J[T: typing.Protocol = typing.List[int]]: pass
class K[T = tuple[*tuple[int]]]: pass
class L[T = match[int]]: pass
class M[T = lazy.List[int]]: pass
class N[T = pkg.types.Value, U = other.models.Box[Leaf]]: pass
